// Global WebSocket connection instance
let ws;

/**
 * Calculates how long ago a timestamp was in minutes
 * @param {number} timestamp - The timestamp to compare against current time
 * @returns {string} A string in the format "X mins ago"
 */
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diffInMinutes = Math.floor((now - timestamp) / (1000 * 60));
    return `${diffInMinutes} mins ago`;
}

/**
 * Establishes WebSocket connection and handles user registration
 * This is called when the connect button is clicked
 */
function connect() {
    // Validate username input
    const username = document.getElementById('username').value.trim();
    if (!username) {
        alert('Please enter your name.');
        return;
    }

    // Determine WebSocket protocol based on current page protocol
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;

    // Create WebSocket connection
    ws = new WebSocket(wsUrl);

    // Handle successful connection
    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'register', username }));
        console.log('Connected to WebSocket server');
    };

    // Handle incoming messages
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'connectionHistory' && data.data) {
                const now = Date.now();
                
                // Handle both array and object data structures for backward compatibility
                const users = Array.isArray(data.data) ? data.data : (data.data.connectedUsers || []);
                const history = Array.isArray(data.data) ? data.data : (data.data.history || []);
    
                // Create a map of unique active users from the last 5 minutes
                const activeUsersMap = new Map();
                users.forEach(user => {
                    const elapsedTime = now - user.connectedAt;
                    if (elapsedTime <= 5 * 60 * 1000) { // 5 minutes in milliseconds
                        activeUsersMap.set(user.username, user.connectedAt);
                    }
                });
    
                // Convert map to array, sort by most recent, and limit to 5 users
                const activeUsers = Array.from(activeUsersMap, ([username, connectedAt]) => ({ username, connectedAt }))
                    .sort((a, b) => b.connectedAt - a.connectedAt)
                    .slice(0, 5);
    
                // Update the connected users list in the UI
                const usersList = document.getElementById('users');
                usersList.innerHTML = activeUsers
                    .map(user => `<li>${user.username} connected - ${getTimeAgo(user.connectedAt)}</li>`)
                    .join('');
    
                // Update the connection history with dynamic entries
                const historyList = document.getElementById('history');
                history.forEach(user => {
                    const time = new Date(user.connectedAt).toLocaleTimeString();
                    // Check if this user already has an entry
                    const existingEntry = document.querySelector(`#history li[data-user="${user.username}"]`);
    
                    if (!existingEntry) {
                        // Create new history entry
                        const listItem = document.createElement("li");
                        listItem.setAttribute("data-user", user.username);
                        listItem.textContent = `${user.username} - ${time}`;
                        historyList.prepend(listItem); // Add new entries at the top
                    }
                });
    
                // Maintain maximum of 10 history entries
                while (historyList.children.length > 10) {
                    historyList.removeChild(historyList.lastChild);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    };
    
    // Handle WebSocket errors
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    // Handle WebSocket connection closure
    ws.onclose = () => {
        console.log('Disconnected from WebSocket server');
    };
}