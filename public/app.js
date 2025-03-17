let ws;

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diffInMinutes = Math.floor((now - timestamp) / (1000 * 60));
    return `${diffInMinutes} mins ago`;
}

function connect() {
    const username = document.getElementById('username').value.trim();
    if (!username) {
        alert('Please enter your name.');
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'register', username }));
        console.log('Connected to WebSocket server');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'connectionHistory' && data.data) {
                const now = Date.now();
                const users = Array.isArray(data.data) ? data.data : (data.data.connectedUsers || []);
                const history = Array.isArray(data.data) ? data.data : (data.data.history || []);
    
                // 🟢 Unique Active Users (last 5 minutes)
                const activeUsersMap = new Map();
                users.forEach(user => {
                    const elapsedTime = now - user.connectedAt;
                    if (elapsedTime <= 5 * 60 * 1000) { // Keep only last 5 mins
                        activeUsersMap.set(user.username, user.connectedAt); // Store latest timestamp
                    }
                });
    
                // Convert back to array and sort by latest time
                const activeUsers = Array.from(activeUsersMap, ([username, connectedAt]) => ({ username, connectedAt }))
                    .sort((a, b) => b.connectedAt - a.connectedAt) // Show newest at top
                    .slice(0, 5); // Keep only last 5 users
    
                // Update UI
                const usersList = document.getElementById('users');
                usersList.innerHTML = activeUsers
                    .map(user => `<li>${user.username} connected - ${getTimeAgo(user.connectedAt)}</li>`)
                    .join('');
    
                // 🔄 **Dynamic Connection History (limit to last 10)**
                const historyList = document.getElementById('history');
                history.forEach(user => {
                    const time = new Date(user.connectedAt).toLocaleTimeString();
                    const existingEntry = document.querySelector(`#history li[data-user="${user.username}"]`);
    
                    if (!existingEntry) {
                        // Create new entry if it doesn't exist
                        const listItem = document.createElement("li");
                        listItem.setAttribute("data-user", user.username);
                        listItem.textContent = `${user.username} - ${time}`;
                        historyList.prepend(listItem);
                    }
                });
    
                // Remove extra history items (keep max 10)
                while (historyList.children.length > 10) {
                    historyList.removeChild(historyList.lastChild);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    };
    
    

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('Disconnected from WebSocket server');
    };
}