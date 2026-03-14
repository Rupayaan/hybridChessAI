import { useState, useEffect, useRef, useCallback } from "react";
import type { GameMode, TimeControl, RoomData } from "./types";
import { useChessAudio } from "./useChessAudio";
import "./chessBoard.scss";

type Piece = {
  sprite: string;
  type: string;
  color: "white" | "black";
};

interface ChessBoardProps {
  gameMode: GameMode;
  timeControl: TimeControl;
  roomData: RoomData | null;
  onBackToDashboard: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || "";
const WS_BASE = import.meta.env.VITE_WS_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

export default function ChessBoard({
  gameMode,
  timeControl,
  roomData,
  onBackToDashboard,
}: ChessBoardProps) {
  const [turn, setTurn] = useState<"white" | "black">("white");
  const [whiteTime, setWhiteTime] = useState(timeControl.minutes * 60);
  const [blackTime, setBlackTime] = useState(timeControl.minutes * 60);
  const [gameStatus, setGameStatus] = useState<
    "playing" | "check" | "checkmate" | "stalemate" | "timeout" | "forfeit" | "waiting"
  >(gameMode === "online" ? "waiting" : "playing");
  const [board, setBoard] = useState<(Piece | null)[][]>([]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [legalMoves, setLegalMoves] = useState<{ row: number; col: number }[]>([]);
  const [gameReady, setGameReady] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [lastMoveNotation, setLastMoveNotation] = useState<string | null>(null);
  const [capturedByWhite, setCapturedByWhite] = useState<Piece[]>([]);
  const [capturedByBlack, setCapturedByBlack] = useState<Piece[]>([]);
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [forfeitWinner, setForfeitWinner] = useState<string | null>(null);
  const [boardHistory, setBoardHistory] = useState<(Piece | null)[][][]>([]);
  const [viewingIndex, setViewingIndex] = useState<number>(-1);
  const [showGameOverDialog, setShowGameOverDialog] = useState(false);
  const [lastMoveSquares, setLastMoveSquares] = useState<{
    from: { row: number; col: number };
    to: { row: number; col: number };
  } | null>(null);
  const [myColor, setMyColor] = useState<"white" | "black">(
    (roomData?.color as "white" | "black") || "white"
  );
  const onlineRoomCode = roomData?.roomCode || "";
  const wsRef = useRef<WebSocket | null>(null);
  const botThinkingRef = useRef(false);
  const { playMove, playCapture, startTicking, stopTicking } = useChessAudio();
  // Inactivity tracking
  const [inactivityTimeout, setInactivityTimeout] = useState<number>(0);
  const [inactivityRemaining, setInactivityRemaining] = useState<number | null>(null);
  const lastMoveTimeRef = useRef<number>(Date.now());
  const INACTIVITY_WARNING_DELAY = 30; // Show warning after 30s of no moves

  // Board orientation: flip when playing as black in online mode
  const isFlipped = gameMode === "online" && myColor === "black";

  // ---- Board orientation helpers ----
  const toRealRow = (displayRow: number): number => isFlipped ? 7 - displayRow : displayRow;
  const toRealCol = (displayCol: number): number => isFlipped ? 7 - displayCol : displayCol;

  const fileLabels = isFlipped
    ? ["h", "g", "f", "e", "d", "c", "b", "a"]
    : ["a", "b", "c", "d", "e", "f", "g", "h"];

  const rankLabels = isFlipped
    ? [1, 2, 3, 4, 5, 6, 7, 8]
    : [8, 7, 6, 5, 4, 3, 2, 1];

  const getDisplayBoard = (b: (Piece | null)[][]): (Piece | null)[][] => {
    if (!isFlipped || b.length === 0) return b;
    return [...b].reverse().map((row) => [...row].reverse());
  };

  // ---- Online Mode: WebSocket Connection ----
  useEffect(() => {
    if (gameMode !== "online" || !roomData) return;

    const ws = new WebSocket(`${WS_BASE}/ws/${roomData.roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WS message:", data);

      switch (data.type) {
        case "connected":
          setMyColor(data.color);
          setBoard(data.board);
          if (data.inactivity_timeout) {
            setInactivityTimeout(data.inactivity_timeout);
          }
          if (data.color === "white") {
            setGameStatus("waiting");
          }
          break;

        case "game_start":
          setBoard(data.board);
          setTurn(data.turn);
          setWhiteTime(data.white_time);
          setBlackTime(data.black_time);
          setGameStatus("playing");
          setGameReady(true);
          setBoardHistory([data.board.map((row: (Piece | null)[]) => [...row])]);
          setViewingIndex(-1);
          lastMoveTimeRef.current = Date.now();
          setInactivityRemaining(null);
          if (data.inactivity_timeout) {
            setInactivityTimeout(data.inactivity_timeout);
          }
          break;

          case "move_made": {
            // Detect capture by comparing captured arrays
            const prevWC = capturedByWhite.length;
            const prevBC = capturedByBlack.length;
            const newWC = (data.capturedByWhite || []).length;
            const newBC = (data.capturedByBlack || []).length;
  
            if (newWC > prevWC || newBC > prevBC) {
              playCapture();
            } else {
              playMove();
            }
  
            setBoard(data.board);
            setTurn(data.turn);
            setGameStatus(data.status);
            setLastMoveNotation(data.lastMove);
            setCapturedByWhite(data.capturedByWhite || []);
            setCapturedByBlack(data.capturedByBlack || []);
            setSelected(null);
            setLegalMoves([]);
            setBoardHistory((prev) => [...prev, data.board.map((row: (Piece | null)[]) => [...row])]);
            setViewingIndex(-1);
            // Track last move squares for highlighting
            if (data.from && data.to) {
              setLastMoveSquares({
                from: { row: data.from[0], col: data.from[1] },
                to: { row: data.to[0], col: data.to[1] },
              });
            }
            // Reset inactivity on every move
            lastMoveTimeRef.current = Date.now();
            setInactivityRemaining(null);
            if (data.increment && data.increment > 0) {
              const moverColor = data.turn === "white" ? "black" : "white";
              if (moverColor === "white") {
                setWhiteTime((prev) => prev + data.increment);
              } else {
                setBlackTime((prev) => prev + data.increment);
              }
            }
            break;
          }

        case "game_over":
          if (data.board) setBoard(data.board);
          setGameStatus(
            data.reason === "forfeit" || data.reason === "disconnect" || data.reason === "inactivity" || data.reason === "abort"
              ? "forfeit"
              : data.reason === "timeout"
                ? "timeout"
                : data.reason === "checkmate"
                  ? "checkmate"
                  : data.reason === "stalemate"
                    ? "stalemate"
                    : "checkmate"
          );
          setForfeitWinner(data.winner);
          if (data.turn) setTurn(data.turn);
          if (data.lastMove) setLastMoveNotation(data.lastMove);
          if (data.capturedByWhite) setCapturedByWhite(data.capturedByWhite);
          if (data.capturedByBlack) setCapturedByBlack(data.capturedByBlack);
          setInactivityRemaining(null);
          break;

        case "error":
          console.error("Server error:", data.message);
          break;
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [gameMode, roomData]);

  // ---- Inactivity countdown (online only) ----
  useEffect(() => {
    if (gameMode !== "online") return;
    if (!gameReady) return;
    if (isGameOver()) return;
    if (gameStatus === "waiting") return;
    if (inactivityTimeout <= 0) return;

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - lastMoveTimeRef.current) / 1000;
      const remaining = Math.max(0, inactivityTimeout - elapsedSeconds);

      // Only show warning after INACTIVITY_WARNING_DELAY seconds of no moves
      if (elapsedSeconds >= INACTIVITY_WARNING_DELAY && remaining > 0) {
        setInactivityRemaining(Math.ceil(remaining));
      } else {
        setInactivityRemaining(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameMode, gameReady, gameStatus, inactivityTimeout]);

  // ---- Bot/Local Mode: Initialize ----
  useEffect(() => {
    if (gameMode === "online") return;

    const init = async () => {
      try {
        setGameReady(false);
        setBotThinking(false);
        botThinkingRef.current = false;

        const res = await fetch(`${API_BASE}/api/reset`, { method: "POST" });
        const data = await res.json();
        setBoard(data.board);
        setTurn(data.turn);
        setWhiteTime(timeControl.minutes * 60);
        setBlackTime(timeControl.minutes * 60);
        setGameStatus("playing");
        setSelected(null);
        setLegalMoves([]);
        setLastMoveNotation(null);
        setCapturedByWhite([]);
        setCapturedByBlack([]);
        setShowForfeitDialog(false);
        setForfeitWinner(null);
        setLastMoveSquares(null);
        setBoardHistory([data.board.map((row: (Piece | null)[]) => [...row])]);
        setViewingIndex(-1);
        setGameReady(true);
      } catch (error) {
        console.error("Failed to initialize game:", error);
      }
    };
    init();
  }, [timeControl, gameMode]);

  // ---- Timer ----
  useEffect(() => {
    if (!gameReady) return;
    if (isGameOver()) return;
    if (gameStatus === "waiting") return;

    // Disable timer entirely in bot mode — untimed play
    if (gameMode === "bot") return;

    const interval = setInterval(() => {
      if (turn === "white") {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            if (gameMode === "online" && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "timeout", winner: "black" }));
            }
            setGameStatus("timeout");
            setForfeitWinner("Black");
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            if (gameMode === "online" && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "timeout", winner: "white" }));
            }
            setGameStatus("timeout");
            setForfeitWinner("White");
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [turn, gameStatus, gameReady, gameMode]);
  useEffect(() => {
    // Disable in bot mode (timers are disabled)
    if (gameMode === "bot") {
      stopTicking();
      return;
    }

    if (!gameReady || isGameOver() || gameStatus === "waiting") {
      stopTicking();
      return;
    }

    const LOW_TIME_THRESHOLD = 20;
    let shouldTick = false;

    if (gameMode === "online") {
      // Only tick when it's YOUR turn and YOUR clock is low
      const myTime = myColor === "white" ? whiteTime : blackTime;
      if (turn === myColor && myTime <= LOW_TIME_THRESHOLD && myTime > 0) {
        shouldTick = true;
      }
    } else {
      // Local mode: tick for whoever's turn it is
      const activeTime = turn === "white" ? whiteTime : blackTime;
      if (activeTime <= LOW_TIME_THRESHOLD && activeTime > 0) {
        shouldTick = true;
      }
    }

    if (shouldTick) {
      startTicking();
    } else {
      stopTicking();
    }
  }, [whiteTime, blackTime, turn, gameMode, myColor, gameStatus, gameReady]);

  // Stop ticking on unmount
  useEffect(() => {
    return () => stopTicking();
  }, [stopTicking]);


  // ---- Bot Move ----
  useEffect(() => {
    if (!gameReady) return;
    if (gameMode !== "bot") return;
    if (turn !== "black") return;
    if (gameStatus !== "playing" && gameStatus !== "check") return;
    if (botThinkingRef.current) return;

    botThinkingRef.current = true;
    setBotThinking(true);

    const timeout = setTimeout(async () => {
      try {
        const prevWhiteCaptures = capturedByWhite.length;
        const prevBlackCaptures = capturedByBlack.length;

        const res = await fetch(`${API_BASE}/api/bot-move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();

        // Play sound based on whether bot captured a piece
        const newWhiteCaptures = (data.capturedByWhite || []).length;
        const newBlackCaptures = (data.capturedByBlack || []).length;
        if (newWhiteCaptures > prevWhiteCaptures || newBlackCaptures > prevBlackCaptures) {
          playCapture();
        } else {
          playMove();
        }

        applyServerResponse(data);
        // No timer logic — bot mode is untimed
      } catch (error) {
        console.error("Bot move failed:", error);
      } finally {
        botThinkingRef.current = false;
        setBotThinking(false);
      }
    }, 500);

    return () => {
      clearTimeout(timeout);
      botThinkingRef.current = false;
      setBotThinking(false);
    };
  }, [turn, gameMode, gameStatus, gameReady]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyServerResponse = (data: any) => {
    setBoard(data.board);
    setTurn(data.turn);
    if (data.status) setGameStatus(data.status);
    if (data.lastMove !== undefined) setLastMoveNotation(data.lastMove);
    if (data.capturedByWhite) setCapturedByWhite(data.capturedByWhite);
    if (data.capturedByBlack) setCapturedByBlack(data.capturedByBlack);

    // Track last move squares for highlighting
    if (data.from && data.to) {
      setLastMoveSquares({
        from: { row: data.from[0], col: data.from[1] },
        to: { row: data.to[0], col: data.to[1] },
      });
    }

    setBoardHistory((prev) => [...prev, data.board.map((row: (Piece | null)[]) => [...row])]);
    setViewingIndex(-1);
  };

  const isGameOver = () => {
    return ["checkmate", "stalemate", "timeout", "forfeit"].includes(gameStatus);
  };

  const fetchLegalMoves = useCallback(async (row: number, col: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/legal-moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, col }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.moves)) {
        setLegalMoves([]);
        return;
      }
      setLegalMoves(data.moves.map(([r, c]: [number, number]) => ({ row: r, col: c })));
    } catch {
      setLegalMoves([]);
    }
  }, []);

  const fetchRoomLegalMoves = useCallback(async (row: number, col: number) => {
    if (!roomData) return;
    try {
      const res = await fetch(`${API_BASE}/api/room/legal-moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomData.roomId, row, col }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.moves)) {
        setLegalMoves([]);
        return;
      }
      setLegalMoves(data.moves.map(([r, c]: [number, number]) => ({ row: r, col: c })));
    } catch {
      setLegalMoves([]);
    }
  }, [roomData]);
  useEffect(() => {
    if (isGameOver()) {
      // Delay showing the dialog so players can process what happened
      const delay = setTimeout(() => {
        setShowGameOverDialog(true);
      }, 1000); // 2.5 second delay

      return () => clearTimeout(delay);
    }
  }, [gameStatus]);
  const movePiece = useCallback(
    async (row: number, col: number) => {
      if (!selected) return;

      if (gameMode === "online") {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "move",
            from_row: selected.row,
            from_col: selected.col,
            to_row: row,
            to_col: col,
          }));
        }
        setSelected(null);
        setLegalMoves([]);
        return;
      }

      // Check if this is a capture BEFORE sending the move
      const targetPiece = board[row]?.[col];
      const movingPiece = board[selected.row]?.[selected.col];
      const isEnPassant =
        movingPiece?.type === "pawn" &&
        selected.col !== col &&
        !targetPiece;
      const isCapture = !!targetPiece || isEnPassant;

      try {
        const res = await fetch(`${API_BASE}/api/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from_row: selected.row,
            from_col: selected.col,
            to_row: row,
            to_col: col,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error(data);
          return;
        }

        // Play appropriate sound
        if (isCapture) {
          playCapture();
        } else {
          playMove();
        }

        setSelected(null);
        setLegalMoves([]);
        applyServerResponse(data);

        if (timeControl.increment > 0) {
          if (data.turn === "black") {
            setWhiteTime((prev) => prev + timeControl.increment);
          } else {
            setBlackTime((prev) => prev + timeControl.increment);
          }
        }
      } catch (error) {
        console.error("Move failed:", error);
      }
    },
    [selected, timeControl.increment, gameMode, board, playMove, playCapture]
  );

  const handleSquareClick = (displayRow: number, displayCol: number) => {
    if (isGameOver()) return;
    if (gameStatus === "waiting") return;
    if (botThinking) return;
    if (isViewingHistory) return;

    // Convert display coordinates to real board coordinates
    const row = toRealRow(displayRow);
    const col = toRealCol(displayCol);

    const piece = board[row]?.[col];

    if (gameMode === "bot" && turn !== "white") return;
    if (gameMode === "online" && turn !== myColor) return;

    if (piece && piece.color === turn) {
      setSelected({ row, col });
      if (gameMode === "online") {
        fetchRoomLegalMoves(row, col);
      } else {
        fetchLegalMoves(row, col);
      }
      return;
    }

    if (selected && legalMoves.some((m) => m.row === row && m.col === col)) {
      movePiece(row, col);
      return;
    }

    setSelected(null);
    setLegalMoves([]);
  };

  const handleBackClick = () => {
    // If game is over, go directly to dashboard (no forfeit needed)
    if (isGameOver()) {
      if (gameMode === "online" && wsRef.current) {
        wsRef.current.close();
      }
      onBackToDashboard();
      return;
    }
    setShowForfeitDialog(true);
  };

  const handleForfeitConfirm = () => {
    if (gameMode === "online" && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "forfeit" }));
    }
    setGameStatus("forfeit");
    const winner = gameMode === "online"
      ? (myColor === "white" ? "Black" : "White")
      : (turn === "white" ? "Black" : "White");
    setForfeitWinner(winner);
    setShowForfeitDialog(false);
  };

  const handleForfeitCancel = () => {
    setShowForfeitDialog(false);
  };

  // ---- Move Navigation ----
  const isViewingHistory = viewingIndex >= 0 && viewingIndex < boardHistory.length - 1;

  const goToPreviousMove = () => {
    if (boardHistory.length <= 1) return;

    if (viewingIndex === -1) {
      setViewingIndex(boardHistory.length - 2);
    } else if (viewingIndex > 0) {
      setViewingIndex(viewingIndex - 1);
    }
  };

  const goToNextMove = () => {
    if (viewingIndex === -1) return;

    if (viewingIndex >= boardHistory.length - 2) {
      setViewingIndex(-1);
    } else {
      setViewingIndex(viewingIndex + 1);
    }
  };

  const goToLiveBoard = () => {
    setViewingIndex(-1);
  };

  // The board to display — either historical or live, then apply flip
  const rawDisplayBoard = viewingIndex >= 0 ? boardHistory[viewingIndex] : board;
  const displayBoard = getDisplayBoard(rawDisplayBoard);

  const handleExitAfterGameOver = () => {
    if (gameMode === "online" && wsRef.current) {
      wsRef.current.close();
    }
    onBackToDashboard();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatInactivityTime = (seconds: number): string => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    return `${seconds}s`;
  };

  const getStatusText = () => {
    switch (gameStatus) {
      case "checkmate":
        return `Checkmate! ${turn === "white" ? "Black" : "White"} wins!`;
      case "stalemate":
        return "Stalemate! Draw.";
      case "check":
        return "Check!";
      case "timeout":
        return `Time out! ${turn === "white" ? "Black" : "White"} wins!`;
      case "forfeit":
        return `${forfeitWinner} wins by forfeit!`;
      case "waiting":
        return `Waiting for opponent...`;
      default:
        return botThinking ? "Bot is thinking..." : "Playing";
    }
  };

  const getBlackStatusText = () => {
    if (gameStatus === "waiting") return "Waiting...";
    if (turn === "black" && !botThinking) return "Playing...";
    if (lastMoveNotation && turn === "white") return `${lastMoveNotation}`;
    if (botThinking) return "Thinking...";
    return "Waiting";
  };

  const getWhiteStatusText = () => {
    if (gameStatus === "waiting") return "Waiting...";
    if (turn === "white") return "Playing...";
    if (lastMoveNotation && turn === "black") return `${lastMoveNotation}`;
    return "Waiting";
  };

  const PIECE_ORDER: Record<string, number> = {
    queen: 5, rook: 4, bishop: 3, knight: 2, pawn: 1,
  };

  const sortCaptured = (pieces: Piece[]) => {
    return [...pieces].sort((a, b) => (PIECE_ORDER[b.type] || 0) - (PIECE_ORDER[a.type] || 0));
  };

  if (board.length === 0 && gameMode !== "online") {
    return (
      <div className="chess-container">
        <p style={{ color: "white", fontSize: "1.5rem" }}>Loading...</p>
      </div>
    );
  }

  const findKingPositions = () => {
    const kings: { white: { row: number; col: number } | null; black: { row: number; col: number } | null } = {
      white: null,
      black: null,
    };
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < (board[r]?.length || 0); c++) {
        const piece = board[r][c];
        if (piece && piece.type === "king") {
          if (piece.color === "white") kings.white = { row: r, col: c };
          else kings.black = { row: r, col: c };
        }
      }
    }
    return kings;
  };

  const getSquareHighlight = (realRow: number, realCol: number): string => {
    const kings = findKingPositions();

    if (gameStatus === "checkmate") {
      const loserColor = turn;
      const winnerColor = turn === "white" ? "black" : "white";

      if (kings[winnerColor] && kings[winnerColor]!.row === realRow && kings[winnerColor]!.col === realCol) {
        return " king-winner";
      }
      if (kings[loserColor] && kings[loserColor]!.row === realRow && kings[loserColor]!.col === realCol) {
        return " king-loser";
      }
    }

    if (gameStatus === "stalemate") {
      if (
        (kings.white && kings.white.row === realRow && kings.white.col === realCol) ||
        (kings.black && kings.black.row === realRow && kings.black.col === realCol)
      ) {
        return " king-stalemate";
      }
    }

    if (gameStatus === "check") {
      const checkedKing = kings[turn as "white" | "black"];
      if (checkedKing && checkedKing.row === realRow && checkedKing.col === realCol) {
        return " king-check";
      }
    }

    if (gameStatus === "timeout" || gameStatus === "forfeit") {
      const winnerStr = forfeitWinner?.toLowerCase();
      if (winnerStr === "white" || winnerStr === "black") {
        const loserStr = winnerStr === "white" ? "black" : "white";
        if (kings[winnerStr] && kings[winnerStr]!.row === realRow && kings[winnerStr]!.col === realCol) {
          return " king-winner";
        }
        if (kings[loserStr] && kings[loserStr]!.row === realRow && kings[loserStr]!.col === realCol) {
          return " king-loser";
        }
      }
    }

    return "";
  };

  // ---- Determine top/bottom player based on orientation ----
  const bottomColor: "white" | "black" = isFlipped ? "black" : "white";
  const topColor: "white" | "black" = isFlipped ? "white" : "black";

  const getTopStatusText = () => topColor === "black" ? getBlackStatusText() : getWhiteStatusText();
  const getBottomStatusText = () => bottomColor === "black" ? getBlackStatusText() : getWhiteStatusText();

  const topTime = topColor === "black" ? blackTime : whiteTime;
  const bottomTime = bottomColor === "black" ? blackTime : whiteTime;

  const topCaptured = topColor === "black" ? capturedByBlack : capturedByWhite;
  const bottomCaptured = bottomColor === "black" ? capturedByBlack : capturedByWhite;

  const topLabel = topColor === "black" ? "⬛ Black" : "⬜ White";
  const bottomLabel = bottomColor === "black" ? "⬛ Black" : "⬜ White";

  const topIsYou = gameMode === "online" && myColor === topColor;
  const bottomIsYou = gameMode === "online" && myColor === bottomColor;

  // ---- Inactivity status: who is stalling? ----
  const stallingColor = inactivityRemaining !== null ? turn : null;
  const isOpponentStalling = gameMode === "online" && stallingColor !== null && stallingColor !== myColor;
  const isYouStalling = gameMode === "online" && stallingColor !== null && stallingColor === myColor;

  if (gameMode === "online" && gameStatus === "waiting") {
    return (
      <div className="chess-container">
        <div className="waiting-panel">
          <div className="waiting-icon">⏳</div>
          <h2>Waiting for Opponent</h2>
          <p>Share this room code with your friend:</p>
          <div className="room-code-display">{onlineRoomCode}</div>
          <p className="waiting-hint">
            They should select <strong>Online → Join Room</strong> and enter this code
          </p>
          <p className="waiting-color-hint">
            You are playing as <strong>{myColor === "white" ? "⬜ White" : "⬛ Black"}</strong>
          </p>
          <button className="waiting-cancel" onClick={onBackToDashboard}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chess-container">
      {showForfeitDialog && (
        <div className="forfeit-overlay">
          <div className="forfeit-dialog">
            <div className="forfeit-icon">⚠️</div>
            <h3>Forfeit Game?</h3>
            <p>
              Leaving now counts as a <strong>forfeit</strong>.
              <br />
              <strong>
                {gameMode === "online"
                  ? myColor === "white" ? "Black" : "White"
                  : turn === "white" ? "Black" : "White"}
              </strong>{" "}
              will be declared the winner.
            </p>
            <div className="forfeit-buttons">
              <button className="forfeit-cancel" onClick={handleForfeitCancel}>Continue Playing</button>
              <button className="forfeit-confirm" onClick={handleForfeitConfirm}>Forfeit & Exit</button>
            </div>
          </div>
        </div>
      )}

      {isGameOver() && showGameOverDialog && !showForfeitDialog && (
        <div className="gameover-overlay">
          <div className="gameover-dialog">
            <button
              className="gameover-close"
              onClick={() => setShowGameOverDialog(false)}
              title="Close and review game"
            >
              ✕
            </button>
            <div className="gameover-icon">
              {gameStatus === "checkmate" ? "♚" : gameStatus === "stalemate" ? "🤝" : gameStatus === "timeout" ? "⏰" : "🏳️"}
            </div>
            <h3>{getStatusText()}</h3>
            <p className="gameover-hint">Close to review moves</p>
            <button className="gameover-exit" onClick={handleExitAfterGameOver}>Back to Dashboard</button>
          </div>
        </div>
      )}

      {/* ---- Top Bar: Back + Game Info ---- */}
      <div className="game-header">
        <button className="back-button" onClick={handleBackClick}>← Back</button>
        <div className="game-info">
          <span className="game-mode">
            {gameMode === "bot" ? "🤖 vs Bot" : gameMode === "local" ? "👥 Local" : "🌐 Online"}
          </span>
          {gameMode === "online" && (
            <span className="room-code-badge">Room: {onlineRoomCode}</span>
          )}
          <span className="time-control-label">{gameMode === "bot" ? "Untimed" : timeControl.label}</span>
          {gameMode === "online" && (
            <span className="my-color-badge">You: {myColor}</span>
          )}
        </div>
      </div>

      {/* ---- Top Player Bar (Opponent) ---- */}
      <div className="player-bar opponent-bar">
        <div className="player-bar-top">
          <div className="player-bar-info">
            <span className="player-bar-label">
              {topLabel} {topIsYou ? "(You)" : gameMode === "bot" ? "(Bot)" : ""}
            </span>
            <span className="player-bar-status">{getTopStatusText()}</span>
          </div>
          <div className={`player-bar-timer ${turn === topColor && !isGameOver() ? "active" : ""} ${gameMode === "bot" ? "timer-disabled" : ""}`}>
            {gameMode === "bot" ? "∞" : formatTime(topTime)}
          </div>
        </div>
        <div className="player-bar-captured">
          {sortCaptured(topCaptured).map((p, i) => (
            <img key={i} src={p.sprite} alt={p.type} className="captured-piece-sm" />
          ))}
        </div>
      </div>

      {/* ---- Inactivity Warning (opponent stalling) ---- */}
      {isOpponentStalling && inactivityRemaining !== null && (
        <div className="inactivity-status inactivity-opponent">
          <span className="inactivity-icon">⏳</span>
          <span className="inactivity-text">
            Opponent inactive — auto-abort in <strong>{formatInactivityTime(inactivityRemaining)}</strong>
          </span>
        </div>
      )}

      {/* ---- Chess Board ---- */}
      <div className="board-area">
        {isViewingHistory && (
          <div className="history-banner" onClick={goToLiveBoard}>
            Viewing move {viewingIndex + 1}/{boardHistory.length - 1} — Tap to return to live
          </div>
        )}
        <div className="rank-labels">
          {rankLabels.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
        <div className="board-and-files">
          <div className={`board ${isViewingHistory ? "viewing-history" : ""}`}>
            {displayBoard.map((boardRow, displayRowIndex) =>
              boardRow.map((piece, displayColIndex) => {
                const realRow = toRealRow(displayRowIndex);
                const realCol = toRealCol(displayColIndex);
                const isLight = (realRow + realCol) % 2 === 0;
                const isSelected = !isViewingHistory && selected?.row === realRow && selected?.col === realCol;
                const isLegalMove = !isViewingHistory && legalMoves.some((m) => m.row === realRow && m.col === realCol);
                const isCapture = isLegalMove && piece !== null;
                const kingHighlight = getSquareHighlight(realRow, realCol);
                const isLastMoveFrom = !isViewingHistory && lastMoveSquares?.from.row === realRow && lastMoveSquares?.from.col === realCol;
                const isLastMoveTo = !isViewingHistory && lastMoveSquares?.to.row === realRow && lastMoveSquares?.to.col === realCol;
                const lastMoveClass = isLastMoveFrom ? " last-move-from" : isLastMoveTo ? " last-move-to" : "";
                return (
                  <div
                    key={`${displayRowIndex}-${displayColIndex}`}
                    className={`square ${isLight ? "light" : "dark"} ${isSelected ? "selected" : ""} ${isLegalMove ? "highlight" : ""}${kingHighlight}${lastMoveClass}`}
                    onClick={() => handleSquareClick(displayRowIndex, displayColIndex)}
                  >
                    {piece && (
                      <img src={piece.sprite} alt={piece.type} className="piece" draggable={false} />
                    )}
                    {isLegalMove && !isCapture && <div className="legal-move-marker" />}
                    {isCapture && <div className="capture-marker" />}
                  </div>
                );
              })
            )}
          </div>
          <div className="file-labels">
            {fileLabels.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Inactivity Warning (you are stalling) ---- */}
      {isYouStalling && inactivityRemaining !== null && (
        <div className="inactivity-status inactivity-self">
          <span className="inactivity-icon">⚠️</span>
          <span className="inactivity-text">
            Make a move! Auto-abort in <strong>{formatInactivityTime(inactivityRemaining)}</strong>
          </span>
        </div>
      )}

      {/* ---- Bottom Player Bar (You / White) ---- */}
      <div className="player-bar my-bar">
        <div className="player-bar-top">
          <div className="player-bar-info">
            <span className="player-bar-label">
              {bottomLabel} {bottomIsYou ? "(You)" : ""}
            </span>
            <span className="player-bar-status">{getBottomStatusText()}</span>
          </div>
          <div className={`player-bar-timer ${turn === bottomColor && !isGameOver() ? "active" : ""} ${gameMode === "bot" ? "timer-disabled" : ""}`}>
            {gameMode === "bot" ? "∞" : formatTime(bottomTime)}
          </div>
        </div>
        <div className="player-bar-captured">
          {sortCaptured(bottomCaptured).map((p, i) => (
            <img key={i} src={p.sprite} alt={p.type} className="captured-piece-sm" />
          ))}
        </div>
      </div>

      {/* ---- Mobile Button Island ---- */}
      <div className="button-island">
        {isGameOver() ? (
          <button
            className="island-btn exit-btn"
            onClick={handleExitAfterGameOver}
            title="Back to Dashboard"
          >
            ←
          </button>
        ) : (
          <button
            className="island-btn forfeit-btn"
            onClick={handleBackClick}
            title="Forfeit"
          >
            🏳️
          </button>
        )}

        <div className="island-center">
          <button className="island-btn disabled" title="More options">
            ⋯
          </button>
          <button className="island-btn disabled" title="Chat">
            💬
          </button>
        </div>

        <div className="island-arrows">
          <button
            className={`island-btn ${viewingIndex === 0 || boardHistory.length <= 1 ? "disabled" : ""}`}
            onClick={goToPreviousMove}
            title="Previous move"
          >
            ◀
          </button>
          <button
            className={`island-btn ${viewingIndex === -1 ? "disabled" : ""}`}
            onClick={goToNextMove}
            title="Next move"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}