const express = require('express');
const app = express();
const http = require('http').createServer(app);

const io = require('socket.io')(http, {
cors: {
origin: "*"
}
});

// Serve public/index.html
app.use(express.static('public'));

const CATEGORIES = {
corporate: [
"compliance", "infrastructure", "optimization", "synergy",
"protocol", "scalability", "framework", "deployment",
"bandwidth", "analytics", "leverage", "metrics",
"integration", "redundancy", "implementation"
],


coding: [
    "javascript", "websocket", "asynchronous", "repository",
    "compilation", "frontend", "middleware", "encryption",
    "deployment", "database", "algorithm", "callback",
    "framework", "variable", "interface"
],

general: [
    "marathon", "velocity", "keyboard", "championship",
    "accelerate", "precision", "countdown", "lightning",
    "frantic", "victory", "champion", "sprint",
    "trophy", "focus", "dynamic"
]


};

let gameState = {
players: {},
roundActive: false,
totalRounds: 0,
hostId: null,
currentCategory: "corporate",
wordTimerDuration: 4,
roundTimer: null
};

function assignHostIfEmpty() {
const activeIds = Object.keys(gameState.players);


if (
    activeIds.length > 0 &&
    (!gameState.hostId || !gameState.players[gameState.hostId])
) {
    gameState.hostId = activeIds[0];
    gameState.players[gameState.hostId].isHost = true;
}


}

function getRandomWord(category) {
const bank = CATEGORIES[category] || CATEGORIES.corporate;
return bank[Math.floor(Math.random() * bank.length)];
}

function sendStateToAll() {
io.emit('updatePlayers', {
players: gameState.players,
hostId: gameState.hostId,
totalRounds: gameState.totalRounds,
roundActive: gameState.roundActive
});
}

function endRound() {
if (!gameState.roundActive) return;


gameState.roundActive = false;

if (gameState.roundTimer) {
    clearTimeout(gameState.roundTimer);
    gameState.roundTimer = null;
}

io.emit('roundEnd');
sendStateToAll();

console.log('Round ended.');


}

io.on('connection', (socket) => {
console.log(`User connected: ${socket.id}`);


socket.on('joinGame', (username) => {
    const cleanName = String(username || '').trim().slice(0, 20);

    if (!cleanName) return;

    gameState.players[socket.id] = {
        name: cleanName,
        score: 0,
        multiplier: 1,
        wordsTyped: 0,
        currentWordChars: 0,
        currentWord: "",
        isHost: false
    };

    assignHostIfEmpty();

    console.log(`${cleanName} joined the game.`);

    sendStateToAll();

    // If someone joins while a round is already running,
    // give them a fresh word.
    if (gameState.roundActive) {
        const word = getRandomWord(gameState.currentCategory);

        gameState.players[socket.id].currentWord = word;
        gameState.players[socket.id].currentWordChars = 0;

        socket.emit('startRound', {
            firstWord: word,
            duration: gameState.wordTimerDuration
        });

        sendStateToAll();
    }
});

socket.on('triggerNewRound', (data) => {
    // Only the host can start a round.
    if (socket.id !== gameState.hostId) return;

    if (gameState.roundActive) return;

    const category = CATEGORIES[data?.category]
        ? data.category
        : "corporate";

    const difficulty = ["easy", "medium", "hard"].includes(data?.difficulty)
        ? data.difficulty
        : "medium";

    gameState.roundActive = true;
    gameState.totalRounds += 1;
    gameState.currentCategory = category;

    if (difficulty === 'easy') {
        gameState.wordTimerDuration = 7;
    } else if (difficulty === 'hard') {
        gameState.wordTimerDuration = 2;
    } else {
        gameState.wordTimerDuration = 4;
    }

    // Reset everyone for the new round.
    for (const id in gameState.players) {
        const player = gameState.players[id];

        player.score = 0;
        player.multiplier = 1;
        player.wordsTyped = 0;
        player.currentWordChars = 0;
        player.currentWord = getRandomWord(gameState.currentCategory);
    }

    // Give each player their first word.
    for (const id in gameState.players) {
        io.to(id).emit('startRound', {
            firstWord: gameState.players[id].currentWord,
            duration: gameState.wordTimerDuration
        });
    }

    sendStateToAll();

    console.log(
        `Round ${gameState.totalRounds} started: ` +
        `${category}, ${difficulty}, ${gameState.wordTimerDuration}s/word`
    );

    // 60-second global match timer.
    gameState.roundTimer = setTimeout(() => {
        endRound();
    }, 60000);
});

// Called on every valid keystroke.
socket.on('typeProgress', (charsTypedInCurrentWord) => {
    if (!gameState.roundActive) return;

    const player = gameState.players[socket.id];

    if (!player) return;

    let chars = Number(charsTypedInCurrentWord);

    if (!Number.isFinite(chars)) {
        return;
    }

    chars = Math.floor(chars);

    // Don't allow the client to report more characters
    // than the current word contains.
    chars = Math.max(
        0,
        Math.min(chars, player.currentWord.length)
    );

    player.currentWordChars = chars;

    sendStateToAll();
});

socket.on('wordCompleted', () => {
    if (!gameState.roundActive) return;

    const player = gameState.players[socket.id];

    if (!player) return;

    // Require the player to have reached the full word length.
    if (
        !player.currentWord ||
        player.currentWordChars < player.currentWord.length
    ) {
        return;
    }

    // Award points using the current multiplier.
    player.score += Math.round(10 * player.multiplier);
    player.wordsTyped += 1;

    // Increase multiplier by 0.2x, maximum 3x.
    if (player.multiplier < 3) {
        player.multiplier = Math.min(
            3,
            parseFloat((player.multiplier + 0.2).toFixed(1))
        );
    }

    // Give this player their next word.
    player.currentWord = getRandomWord(gameState.currentCategory);
    player.currentWordChars = 0;

    socket.emit('nextWordDelivery', {
        word: player.currentWord,
        duration: gameState.wordTimerDuration
    });

    sendStateToAll();
});

socket.on('wordFailed', () => {
    if (!gameState.roundActive) return;

    const player = gameState.players[socket.id];

    if (!player) return;

    // Reset streak.
    player.multiplier = 1;

    // Give the player a new word.
    player.currentWord = getRandomWord(gameState.currentCategory);
    player.currentWordChars = 0;

    socket.emit('nextWordDelivery', {
        word: player.currentWord,
        duration: gameState.wordTimerDuration
    });

    sendStateToAll();
});

socket.on('disconnect', () => {
    const player = gameState.players[socket.id];

    if (player) {
        console.log(`${player.name} disconnected.`);
    }

    delete gameState.players[socket.id];

    // If the host leaves, assign a new host.
    if (socket.id === gameState.hostId) {
        gameState.hostId = null;
        assignHostIfEmpty();
    }

    sendStateToAll();
});


});

const PORT = process.env.PORT || 5500;

http.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
