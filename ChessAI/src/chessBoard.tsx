import { useState } from "react";
import "./chessBoard.scss";
const rank = ["8", "7", "6", "5", "4", "3", "2", "1"];
const file = ["a", "b", "c", "d", "e", "f", "g", "h"];
type Piece = {
  sprite: string;
};
const createBoard = () =>
  Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));
export default function ChessBoard() {
  const [board, setBoard] = useState<(Piece | null)[][]>(() => {
    const b = createBoard();

    // Define piece types for back rank
    const backRank = [
      "rook",
      "knight",
      "bishop",
      "queen",
      "king",
      "bishop",
      "knight",
      "rook",
    ];

    // Initialize black pieces (top of board)
    backRank.forEach((piece, col) => {
      b[0][col] = { sprite: `../assets/${piece}1.png` };
    });
    for (let col = 0; col < 8; col++) {
      b[1][col] = { sprite: "../assets/pawn1.png" };
    }

    // Initialize white pieces (bottom of board)
    backRank.forEach((piece, col) => {
      b[7][col] = { sprite: `../assets/${piece}.png` };
    });
    for (let col = 0; col < 8; col++) {
      b[6][col] = { sprite: "../assets/pawn.png" };
    }

    return b;
  });
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null,
  );
  const movePiece = (row: number, col: number) => {
    if (!selected) return;
    const copy = board.map((row) => [...row]);
    copy[row][col] = copy[selected.row][selected.col];
    copy[selected.row][selected.col] = null;
    setBoard(copy);
    setSelected(null);
  };
  const handleSquareClick = (row: number, col: number) => {
    if (board[row][col]) {
      setSelected({ row, col });
    } else if (selected) {
      movePiece(row, col);
    }
  };
  return (
    <div className="board">
      {rank.map((rank, rowIndex) =>
        file.map((file, colIndex) => {
          const isWhite = (rowIndex + colIndex) % 2 === 0;
          const piece = board[rowIndex][colIndex];
          return (
            <div
              key={`${file}${rank}`}
              className={`square ${isWhite ? "white" : "black"}`}
              onClick={() => handleSquareClick(rowIndex, colIndex)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => movePiece(rowIndex, colIndex)}
            >
              {/* {colIndex === 0 && <span className="rank-label">{rank}</span>}
              {rowIndex === rank.length -1&& (
                <span className="file-label">{file}</span>
                only display  label on the first column and last row
              )} */}
              <span>{`${file}${rank}`}</span>{" "}
              {/* Display the square's coordinate for testing */}
              {piece && (
                <img
                  src={piece.sprite}
                  alt="piece"
                  className="piece"
                  draggable
                  onDragStart={() =>
                    setSelected({ row: rowIndex, col: colIndex })
                  }
                />
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}