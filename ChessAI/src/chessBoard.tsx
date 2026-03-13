import { useState, useEffect, useRef, useCallback } from "react";
import type { GameMode, TimeControl, RoomData } from "./types";
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

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const WS_BASE = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000";

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

  const [myColor, setMyColor] = useState<"white" | "black">(
    (roomData?.color as "white" | "black") || "white"
  );
  const onlineRoomCode = roomData?.roomCode || "";
  const wsRef = useRef<WebSocket | null>(null);
  const botThinkingRef = useRef(false);

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
          break;

        case "move_made":
          setBoard(data.board);
          setTurn(data.turn);
          setGameStatus(data.status);
          setLastMoveNotation(data.lastMove);
          setCapturedByWhite(data.capturedByWhite || []);
          setCapturedByBlack(data.capturedByBlack || []);
          setSelected(null);
          setLegalMoves([]);
          // Apply increment to the player who just moved
          if (data.increment && data.increment > 0) {
            const moverColor = data.turn === "white" ? "black" : "white";
            if (moverColor === "white") {
              setWhiteTime((prev) => prev + data.increment);
            } else {
              setBlackTime((prev) => prev + data.increment);
            }
          }
          break;

        case "game_over":
          if (data.board) setBoard(data.board);
          setGameStatus(
            data.reason === "forfeit"
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
    if (botThinking) return;

    const interval = setInterval(() => {
      if (turn === "white") {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            if (gameMode === "online" && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: "timeout",
                winner: "black",
              }));
            }
            setGameStatus("timeout");
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            if (gameMode === "online" && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: "timeout",
                winner: "white",
              }));
            }
            setGameStatus("timeout");
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [turn, gameStatus, gameReady, botThinking, gameMode]);

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
        const res = await fetch(`${API_BASE}/api/bot-move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        applyServerResponse(data);
        if (timeControl.increment > 0) {
          setBlackTime((prev) => prev + timeControl.increment);
        }
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
  }, [turn, gameMode, gameStatus, gameReady, timeControl.increment]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyServerResponse = (data: any) => {
    setBoard(data.board);
    setTurn(data.turn);
    if (data.status) setGameStatus(data.status);
    if (data.lastMove !== undefined) setLastMoveNotation(data.lastMove);
    if (data.capturedByWhite) setCapturedByWhite(data.capturedByWhite);
    if (data.capturedByBlack) setCapturedByBlack(data.capturedByBlack);
  };

  const isGameOver = () => {
    return ["checkmate", "stalemate", "timeout", "forfeit"].includes(gameStatus);
  };

  // ---- Legal Moves (bot + local) ----
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

  // ---- Legal Moves (online — room-aware) ----
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

  // ---- Move Piece ----
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
    [selected, timeControl.increment, gameMode]
  );

  // ---- Square Click Handler ----
  const handleSquareClick = (row: number, col: number) => {
    if (isGameOver()) return;
    if (gameStatus === "waiting") return;
    if (botThinking) return;

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

  // ---- Forfeit / Back ----
  const handleBackClick = () => {
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
    if (lastMoveNotation && turn === "white") return `Last move: ${lastMoveNotation}`;
    if (botThinking) return "Thinking...";
    return "Waiting";
  };

  const getWhiteStatusText = () => {
    if (gameStatus === "waiting") return "Waiting...";
    if (turn === "white") return "Playing...";
    if (lastMoveNotation && turn === "black") return `Last move: ${lastMoveNotation}`;
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

      {isGameOver() && !showForfeitDialog && (
        <div className="gameover-overlay">
          <div className="gameover-dialog">
            <div className="gameover-icon">
              {gameStatus === "checkmate" ? "♚" : gameStatus === "stalemate" ? "🤝" : gameStatus === "timeout" ? "⏰" : "🏳️"}
            </div>
            <h3>{getStatusText()}</h3>
            <button className="gameover-exit" onClick={handleExitAfterGameOver}>Back to Dashboard</button>
          </div>
        </div>
      )}

      <div className="game-header">
        <button className="back-button" onClick={handleBackClick}>← Back</button>
        <div className="game-info">
          <span className="game-mode">
            {gameMode === "bot" ? "🤖 vs Bot" : gameMode === "local" ? "👥 Local" : "🌐 Online"}
          </span>
          {gameMode === "online" && (
            <span className="room-code-badge">Room: {onlineRoomCode}</span>
          )}
          <span className="time-control-label">{timeControl.label}</span>
          {gameMode === "online" && (
            <span className="my-color-badge">You: {myColor}</span>
          )}
        </div>
      </div>

      <div className="game-layout">
        <div className="board-wrapper">
          <div className="board">
            {board.map((boardRow, rowIndex) =>
              boardRow.map((piece, colIndex) => {
                const isLight = (rowIndex + colIndex) % 2 === 0;
                const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
                const isLegalMove = legalMoves.some((m) => m.row === rowIndex && m.col === colIndex);
                const isCapture = isLegalMove && piece !== null;

                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={`square ${isLight ? "light" : "dark"} ${isSelected ? "selected" : ""} ${isLegalMove ? "highlight" : ""}`}
                    onClick={() => handleSquareClick(rowIndex, colIndex)}
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
            {["a", "b", "c", "d", "e", "f", "g", "h"].map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
          <div className="rank-labels">
            {[8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
              <span key={r}>{r}</span>
            ))}
          </div>
        </div>

        <div className="side-panel">
          <div className="player-panel black-panel">
            <div className={`player-timer ${turn === "black" && !isGameOver() ? "active" : ""}`}>
              <span className="player-label">⬛ Black {gameMode === "online" && myColor === "black" ? "(You)" : ""}</span>
              <span className="player-time">{formatTime(blackTime)}</span>
            </div>
            <div className="player-status"><span>{getBlackStatusText()}</span></div>
          </div>

          <div className="captured-section">
            <div className="captured-label">Captured by Black</div>
            <div className="captured-pieces">
              {sortCaptured(capturedByBlack).length > 0 ? (
                sortCaptured(capturedByBlack).map((p, i) => (
                  <img key={i} src={p.sprite} alt={p.type} className="captured-piece" />
                ))
              ) : (
                <span className="no-captures">—</span>
              )}
            </div>
          </div>

          <div className="game-status-box">
            <div className="status-label">Game Status</div>
            <div className="status-text">{getStatusText()}</div>
          </div>

          <div className="captured-section">
            <div className="captured-label">Captured by White</div>
            <div className="captured-pieces">
              {sortCaptured(capturedByWhite).length > 0 ? (
                sortCaptured(capturedByWhite).map((p, i) => (
                  <img key={i} src={p.sprite} alt={p.type} className="captured-piece" />
                ))
              ) : (
                <span className="no-captures">—</span>
              )}
            </div>
          </div>

          <div className="player-panel white-panel">
            <div className={`player-timer ${turn === "white" && !isGameOver() ? "active" : ""}`}>
              <span className="player-label">⬜ White {gameMode === "online" && myColor === "white" ? "(You)" : ""}</span>
              <span className="player-time">{formatTime(whiteTime)}</span>
            </div>
            <div className="player-status"><span>{getWhiteStatusText()}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}