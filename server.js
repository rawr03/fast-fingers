server.js
// Install dependencies first: npm install express socket.io

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" } // Allows connections from GitHub Pages or Vercel
});

// A boring, corporate-sounding word bank to generate text blocks
const WORD_BANK = [
    "compliance", "infrastructure", "optimization", "synergy", "protocol", 
    "scalability", "framework", "deployment", "bandwidth", "analytics", 
    "implementation", "integration", "redundancy", "leverage", "metrics"
];

let gameState = {
    players: {}, // Tracks { socketId: { name, score, progress } }
    currentWords: "",
    roundActive: false
};

function generateRoundWords() {
    // Pick 10 random words from the bank and join them
    let shuffled = [...WORD_BANK].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 10).join(" ");
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join Game
    socket.on('joinGame', (username) => {
        gameState.players[socket.id] = { name: username, score: 0, progress: 0 };
        io.emit('updatePlayers', gameState.players);
        
        // If a round is already running, send them the current text
        if (gameState.roundActive) {
            socket.emit('startRound', gameState.currentWords);
        }
    });

    // Start a new round (Any player can trigger, or automate it)
    socket.on('triggerNewRound', () => {
        if (gameState.roundActive) return;
        
        gameState.roundActive = true;
        gameState.currentWords = generateRoundWords();
        
        // Reset player round progress
        for (let id in gameState.players) {
            gameState.players[id].progress = 0;
        }

        io.emit('startRound', gameState.currentWords);
    });

    // Handle typing progress updates
    socket.on('typeProgress', (typedLength) => {
        if (!gameState.roundActive || !gameState.players[socket.id]) return;

        let totalLength = gameState.currentWords.length;
        let percentage = Math.floor((typedLength / totalLength) * 100);
        gameState.players[socket.id].progress = percentage;

        // Broadcast updated progress to everyone for the live sidebar
        io.emit('updatePlayers', gameState.players);

        // Check if they finished perfectly
        if (percentage >= 100) {
            gameState.roundActive = false;
            // Award points: faster finish = higher score
            gameState.players[socket.id].score += 10; 
            
            io.emit('roundEnd', {
                winner: gameState.players[socket.id].name,
                players: gameState.players
            });
        }
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('updatePlayers', gameState.players);
    });
});

// Force port 443/80 standard traffic to trick firewalls
const PORT = process.env.PORT || 5500;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
