import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Redis client setup
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));

redisClient.connect().catch((err) => {
  console.error("Failed to connect to Redis:", err);
});

interface ConnectedUser {
  username: string;
  connectedAt: number;
}

// Store connected users in memory
let connectedUsers: ConnectedUser[] = [];

/**
 * Removes users who have been inactive for more than 5 minutes
 * Also cleans up the Redis history for expired entries
 */
const removeInactiveUsers = async () => {
  const now = Date.now();
  
  // Remove users connected more than 5 minutes ago
  connectedUsers = connectedUsers.filter((user) => {
    const elapsedTime = now - user.connectedAt;
    if (elapsedTime > 5 * 60 * 1000) {
      console.log(`Removing inactive user: ${user.username}`);
      return false;
    }
    return true;
  });

  // Maintain maximum of 5 connected users
  if (connectedUsers.length > 5) {
    connectedUsers = connectedUsers.slice(-5);
  }

  // Clean up Redis history for expired entries (older than 5 minutes)
  const history = await redisClient.lRange("connectionHistory", 0, -1);
  for (const entry of history) {
    const { username, connectedAt } = JSON.parse(entry);
    if (now - connectedAt > 5 * 60 * 1000) {
      await redisClient.lRem("connectionHistory", 1, entry);
    }
  }

  // Update all clients with the new lists
  broadcastConnectionHistory();
};

/**
 * Broadcasts the current state (connected users and history)
 * to all connected WebSocket clients
 */
const broadcastConnectionHistory = async () => {
  try {
    // Get current active users
    const userList = connectedUsers.map(user => ({
      username: user.username,
      connectedAt: user.connectedAt
    }));

    // Get connection history from Redis
    const history = await redisClient.lRange("connectionHistory", 0, -1);
    const connectionHistory = history.map(entry => JSON.parse(entry));

    // Prepare the payload
    const payload = {
      type: "connectionHistory",
      data: {
        connectedUsers: userList,
        history: connectionHistory
      }
    };

    console.log('Broadcasting:', payload);

    // Send to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });
  } catch (error) {
    console.error('Error in broadcastConnectionHistory:', error);
  }
};

// WebSocket connection
wss.on("connection", (ws) => {
  console.log('New WebSocket connection established');

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received message:', data);
      
      // Handle user registration
      if (data.type === "register") {
        const username = data.username || `User-${Math.floor(Math.random() * 1000)}`;
        const connectedAt = Date.now();
        const userEntry = { username, connectedAt };

        console.log('Registering new user:', userEntry);

        // Add to active users
        connectedUsers.push(userEntry);

        // Maintain maximum of 5 connected users
        if (connectedUsers.length > 5) {
          connectedUsers = connectedUsers.slice(-5);
        }

        // Add to connection history in Redis
        await redisClient.lPush("connectionHistory", JSON.stringify(userEntry));
        
        // Maintain maximum of 10 history entries
        await redisClient.lTrim("connectionHistory", 0, 9);

        console.log('Current connected users:', connectedUsers);
        console.log('User connected:', username);

        // Update all clients
        await broadcastConnectionHistory();
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  ws.on("close", () => {
    console.log("A user disconnected");
  });
});

// Check for inactive users every minute
setInterval(removeInactiveUsers, 60 * 1000);

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Start the Express server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Upgrade HTTP server to WebSocket server
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy(); // Reject non-WebSocket upgrade requests
  }
});