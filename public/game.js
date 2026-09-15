let socket = null;

let currentWord = "";

let wordTimer = null;
let transitionTimeout = null;

let timeLeft = 0;
let maxTimeAllowed = 4;

let myId = null;

let wordPenaltyLocked = false;


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const inputField =
    document.getElementById("typeInput");


/* =========================================================
   PASTE PROTECTION
   ========================================================= */

inputField.addEventListener("paste", (event) => {

    event.preventDefault();

    if (!wordPenaltyLocked) {
        penalizePlayer();
    }

});


/* =========================================================
   CONNECT
   ========================================================= */

function connectToServer() {

    const name =
        document
            .getElementById("username")
            .value
            .trim();


    if (!name) {

        alert(
            "IDENTIFICATION ERROR: " +
            "Codename cannot be empty."
        );

        return;
    }


    /*
     * Prevent creating multiple Socket.IO
     * connections if the button is clicked twice.
     */

    if (socket) {
        return;
    }


    socket = io();


    /* =====================================================
       CONNECTION SUCCESS
       ===================================================== */

    socket.on("connect", () => {

        myId = socket.id;


        document.getElementById("login")
            .style.display = "none";

        document.getElementById("game")
            .style.display = "grid";


        socket.emit("joinGame", name);

    });


    /* =====================================================
       CONNECTION ERROR
       ===================================================== */

    socket.on("connect_error", (error) => {

        console.error(
            "Socket connection failed:",
            error
        );

        alert(
            "NETWORK ERROR: " +
            "Unable to establish secure connection."
        );

    });


    /* =====================================================
       LIVE PLAYER STATE
       ===================================================== */

    socket.on("updatePlayers", (data) => {

        document.getElementById("roundCounter")
            .innerText = data.totalRounds;


        /* =================================================
           HOST
           ================================================= */

        if (data.hostId === myId) {

            document.getElementById("hostControls")
                .style.display =
                data.roundActive
                    ? "none"
                    : "block";


            document.getElementById("playerWaitingMsg")
                .style.display = "none";


            /*
             * Keep start button synchronized
             * with server state.
             */

            document.getElementById("startBtn")
                .disabled = data.roundActive;

        }


        /* =================================================
           PLAYER
           ================================================= */

        else {

            document.getElementById("hostControls")
                .style.display = "none";


            document.getElementById("playerWaitingMsg")
                .style.display =
                data.roundActive
                    ? "none"
                    : "block";

        }


        /* =================================================
           PERSONAL MULTIPLIER
           ================================================= */

        if (data.players[myId]) {

            document.getElementById(
                "multiplierDisplay"
            ).innerText =
                `CURRENT MULTIPLIER: ` +
                `${data.players[myId].multiplier}x`;

        }


        /* =================================================
           SORT PLAYERS
           ================================================= */

        const sortedPlayers =
            Object.entries(data.players)

                .map(([id, player]) => ({
                    id,
                    ...player
                }))

                .sort(
                    (a, b) =>
                        b.score - a.score
                );


        const leaderboard =
            document.getElementById(
                "leaderboard"
            );


        leaderboard.innerHTML = "";


        /* =================================================
           BUILD LEADERBOARD
           ================================================= */

        sortedPlayers.forEach(
            (player, index) => {

                const isHost =
                    player.id === data.hostId;


                const wordLength =
                    player.currentWord
                        ? player.currentWord.length
                        : 0;


                const typed =
                    player.currentWordChars || 0;


                let progressPercent = 0;


                if (wordLength > 0) {

                    progressPercent =
                        Math.floor(
                            (typed / wordLength) * 100
                        );

                }


                progressPercent =
                    Math.max(
                        0,
                        Math.min(
                            100,
                            progressPercent
                        )
                    );


                const barClass =
                    isHost
                        ? "progress-fill host-progress"
                        : "progress-fill";


                leaderboard.innerHTML += `

                    <div class="player-card">

                        ${
                            isHost
                                ? `
                                    <span class="host-badge">
                                        HOST
                                    </span>
                                  `
                                : ""
                        }

                        <span class="rank-badge">
                            #${index + 1}
                        </span>

                        <strong>
                            ${escapeHtml(
                                player.name
                            )}
                        </strong>

                        <div class="stat-line">

                            SCORE:
                            <strong>
                                ${player.score}
                            </strong>

                            &nbsp;//

                            STREAK:
                            <strong>
                                ${player.multiplier}x
                            </strong>

                        </div>

                        <div class="stat-line">

                            PACKETS DECRYPTED:
                            <strong>
                                ${player.wordsTyped}
                            </strong>

                        </div>

                        <div class="progress-label">

                            <span>
                                TARGET PROGRESS
                            </span>

                            <span>
                                ${progressPercent}%
                            </span>

                        </div>

                        <div class="progress-bar">

                            <div
                                class="${barClass}"
                                style="
                                    width:
                                    ${progressPercent}%
                                "
                            ></div>

                        </div>

                    </div>

                `;

            }
        );

    });


    /* =====================================================
       ROUND START
       ===================================================== */

    socket.on("startRound", (config) => {

        maxTimeAllowed =
            Number(config.duration) || 4;


        document.getElementById("startBtn")
            .disabled = true;


        loadWordTarget(
            config.firstWord
        );

    });


    /* =====================================================
       NEXT WORD
       ===================================================== */

    socket.on(
        "nextWordDelivery",
        (data) => {

            /*
             * Server normally sends:
             *
             * {
             *     word: "...",
             *     duration: 5
             * }
             *
             * This also keeps compatibility
             * with a plain string.
             */

            if (typeof data === "string") {

                loadWordTarget(data);

            }

            else {

                if (data.duration) {

                    maxTimeAllowed =
                        Number(data.duration);

                }


                loadWordTarget(
                    data.word
                );

            }

        }
    );


    /* =====================================================
       ROUND END
       ===================================================== */

    socket.on("roundEnd", () => {

        clearInterval(wordTimer);
        wordTimer = null;


        if (transitionTimeout) {

            clearTimeout(transitionTimeout);

            transitionTimeout = null;

        }


        inputField.value = "";

        inputField.disabled = true;


        document.getElementById(
            "targetText"
        ).classList.remove(
            "word-arrival"
        );


        document.getElementById(
            "targetText"
        ).classList.add(
            "word-transition",
            "transition-message"
        );


        document.getElementById(
            "targetText"
        ).innerText =
            "// BREACH COMPLETE";


        document.getElementById(
            "timerDisplay"
        ).innerText =
            "ROUND OVER // ACCESS DENIED";


        /*
         * The updatePlayers event should also
         * re-enable the host button.
         */

        document.getElementById("startBtn")
            .disabled = false;


        alert(
            "BREACH WINDOW CLOSED.\n\n" +
            "Review the final operator rankings."
        );

    });

}


/* =========================================================
   LOAD WORD TARGET
   ========================================================= */

function loadWordTarget(word) {

    currentWord = word;

    wordPenaltyLocked = false;


    const target =
        document.getElementById(
            "targetText"
        );


    /*
     * Stop previous timer.
     */

    clearInterval(wordTimer);

    wordTimer = null;


    /*
     * Cancel any previous animation
     * transition that hasn't finished.
     */

    if (transitionTimeout) {

        clearTimeout(transitionTimeout);

        transitionTimeout = null;

    }


    /*
     * Start transition animation.
     */

    target.classList.remove(
        "word-arrival"
    );


    target.classList.add(
        "word-transition"
    );


    target.classList.add(
        "transition-message"
    );


    target.innerText =
        "// DECRYPTING NEXT TARGET...";


    /*
     * Disable input during transition.
     */

    inputField.disabled = true;

    inputField.value = "";


    /*
     * Wait 500ms before revealing
     * the next target.
     */

    transitionTimeout =
        setTimeout(() => {

            target.innerText =
                currentWord;


            target.classList.remove(
                "word-transition",
                "transition-message"
            );


            target.classList.add(
                "word-arrival"
            );


            /*
             * Allow player to type.
             */

            inputField.disabled = false;

            inputField.focus();


            /*
             * Timer begins AFTER
             * the target appears.
             */

            timeLeft =
                maxTimeAllowed;


            updateTimerDisplay();


            wordTimer =
                setInterval(() => {

                    timeLeft--;

                    updateTimerDisplay();


                    if (timeLeft <= 0) {

                        clearInterval(wordTimer);

                        wordTimer = null;


                        if (!wordPenaltyLocked) {

                            penalizePlayer();

                        }

                    }

                }, 1000);


            /*
             * Remove arrival animation.
             */

            setTimeout(() => {

                target.classList.remove(
                    "word-arrival"
                );

            }, 350);


            transitionTimeout = null;

        }, 500);

}


/* =========================================================
   TIMER
   ========================================================= */

function updateTimerDisplay() {

    document.getElementById(
        "timerDisplay"
    ).innerText =
        `WORD TIME REMAINING: ${timeLeft}s`;

}


/* =========================================================
   TYPING
   ========================================================= */

function handleInput() {

    if (
        !socket ||
        !currentWord ||
        wordPenaltyLocked ||
        inputField.disabled
    ) {
        return;
    }


    const currentInput =
        inputField.value;


    /*
     * Check whether the typed text
     * is still a valid prefix.
     */

    if (
        currentWord.startsWith(
            currentInput
        )
    ) {

        inputField.classList.remove(
            "error-flash"
        );


        /*
         * Tell server how many
         * characters were typed.
         */

        socket.emit(
            "typeProgress",
            currentInput.length
        );


        /*
         * Complete word.
         */

        if (
            currentInput ===
            currentWord
        ) {

            clearInterval(wordTimer);

            wordTimer = null;

            wordPenaltyLocked = true;

            inputField.disabled = true;


            socket.emit(
                "wordCompleted"
            );

        }

    }


    /*
     * Incorrect character.
     */

    else {

        clearInterval(wordTimer);

        wordTimer = null;

        penalizePlayer();

    }

}


/* =========================================================
   FAILURE
   ========================================================= */

function penalizePlayer() {

    if (
        !socket ||
        wordPenaltyLocked
    ) {
        return;
    }


    wordPenaltyLocked = true;


    clearInterval(wordTimer);

    wordTimer = null;


    /*
     * Disable input while waiting
     * for the server's next word.
     */

    inputField.disabled = true;


    inputField.classList.add(
        "error-flash"
    );


    socket.emit(
        "wordFailed"
    );


    /*
     * Remove error animation.
     */

    setTimeout(() => {

        inputField.classList.remove(
            "error-flash"
        );

    }, 400);

}


/* =========================================================
   HOST START
   ========================================================= */

function requestNewRound() {

    if (!socket) {
        return;
    }


    const category =
        document.getElementById(
            "hostCategory"
        ).value;


    const difficulty =
        document.getElementById(
            "hostDifficulty"
        ).value;


    socket.emit(
        "triggerNewRound",
        {
            category,
            difficulty
        }
    );

}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHtml(value) {

    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   KEYBOARD INPUT
   ========================================================= */

inputField.addEventListener(
    "input",
    handleInput
);


document
    .getElementById("username")
    .addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Enter") {

                connectToServer();

            }

        }
    );

