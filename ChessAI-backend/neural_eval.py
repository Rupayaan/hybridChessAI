"""
Neural Network Board Evaluator
- Trained on chess positions to evaluate who is winning
- Uses a simple feedforward network
- Input: 8x8x12 board representation (one-hot per piece type)
- Output: single score (positive = white winning)
"""

import os
import json
import math
import random


# ---- Board Encoding ----
PIECE_TO_INDEX = {
    "P": 0, "N": 1, "B": 2, "R": 3, "Q": 4, "K": 5,
    "p": 6, "n": 7, "b": 8, "r": 9, "q": 10, "k": 11,
}


def encode_board(board):
    """
    Encode board as a flat vector of 768 values (8x8x12).
    Each square has 12 channels (one per piece type).
    """
    encoded = [0.0] * 768  # 8 * 8 * 12

    for row in range(8):
        for col in range(8):
            piece = board[row][col]
            if piece and piece in PIECE_TO_INDEX:
                index = (row * 8 + col) * 12 + PIECE_TO_INDEX[piece]
                encoded[index] = 1.0

    return encoded


# ---- Simple Neural Network (no PyTorch/TensorFlow dependency) ----
def sigmoid(x):
    x = max(-500, min(500, x))
    return 1.0 / (1.0 + math.exp(-x))


def relu(x):
    return max(0.0, x)


def tanh(x):
    x = max(-500, min(500, x))
    return math.tanh(x)


class NeuralEvaluator:
    """
    Simple feedforward neural network for board evaluation.
    Architecture: 768 -> 256 -> 64 -> 1

    Can be:
    1. Initialized with random weights (untrained baseline)
    2. Loaded from a trained weights file
    3. Trained on position-evaluation pairs
    """

    def __init__(self):
        self.weights = None
        self.biases = None
        self.layer_sizes = [768, 256, 64, 1]
        self.trained = False

        # Try to load pre-trained weights
        weights_path = os.path.join(os.path.dirname(__file__), "nn_weights.json")
        if os.path.exists(weights_path):
            self.load_weights(weights_path)
        else:
            self._initialize_random_weights()

    def _initialize_random_weights(self):
        """Xavier initialization for weights."""
        self.weights = []
        self.biases = []

        for i in range(len(self.layer_sizes) - 1):
            fan_in = self.layer_sizes[i]
            fan_out = self.layer_sizes[i + 1]
            limit = math.sqrt(6.0 / (fan_in + fan_out))

            w = []
            for _ in range(fan_out):
                row = [random.uniform(-limit, limit) for _ in range(fan_in)]
                w.append(row)
            self.weights.append(w)

            b = [0.0] * fan_out
            self.biases.append(b)

    def forward(self, inputs):
        """Forward pass through the network."""
        current = inputs

        for layer_idx in range(len(self.weights)):
            w = self.weights[layer_idx]
            b = self.biases[layer_idx]
            next_layer = []

            for neuron_idx in range(len(w)):
                # Dot product + bias
                total = b[neuron_idx]
                for j in range(len(current)):
                    total += w[neuron_idx][j] * current[j]

                # Activation
                if layer_idx < len(self.weights) - 1:
                    total = relu(total)  # Hidden layers: ReLU
                else:
                    total = tanh(total)  # Output: tanh (-1 to 1)

                next_layer.append(total)

            current = next_layer

        return current[0]  # Single output value

    def evaluate(self, board):
        """
        Evaluate a board position.
        Returns a score in centipawns (scaled from tanh output).
        Positive = white advantage.
        """
        encoded = encode_board(board)
        raw_output = self.forward(encoded)

        # Scale tanh output (-1 to 1) to centipawns (-1000 to 1000)
        return raw_output * 1000

    def save_weights(self, filepath):
        """Save weights to JSON file."""
        data = {
            "layer_sizes": self.layer_sizes,
            "weights": self.weights,
            "biases": self.biases,
            "trained": self.trained,
        }
        with open(filepath, "w") as f:
            json.dump(data, f)

    def load_weights(self, filepath):
        """Load weights from JSON file."""
        with open(filepath, "r") as f:
            data = json.load(f)
        self.layer_sizes = data["layer_sizes"]
        self.weights = data["weights"]
        self.biases = data["biases"]
        self.trained = data.get("trained", False)


# ---- Training ----
def train_neural_evaluator(evaluator, training_data, epochs=100, learning_rate=0.001):
    """
    Train the neural network on position-evaluation pairs.

    training_data: list of (board, target_score) tuples
                   target_score in centipawns, will be normalized to -1..1
    """
    print(f"Training on {len(training_data)} positions for {epochs} epochs...")

    for epoch in range(epochs):
        total_loss = 0.0
        random.shuffle(training_data)

        for board, target in training_data:
            encoded = encode_board(board)
            # Normalize target to -1..1 range
            target_normalized = max(-1.0, min(1.0, target / 1000.0))

            # Forward pass (store activations for backprop)
            activations = [encoded]
            current = encoded

            for layer_idx in range(len(evaluator.weights)):
                w = evaluator.weights[layer_idx]
                b = evaluator.biases[layer_idx]
                next_layer = []

                for neuron_idx in range(len(w)):
                    total = b[neuron_idx]
                    for j in range(len(current)):
                        total += w[neuron_idx][j] * current[j]

                    if layer_idx < len(evaluator.weights) - 1:
                        total = relu(total)
                    else:
                        total = tanh(total)

                    next_layer.append(total)

                current = next_layer
                activations.append(current)

            output = current[0]
            error = target_normalized - output
            total_loss += error ** 2

            # Backpropagation (simplified gradient descent)
            # Output layer gradient
            output_grad = error * (1 - output ** 2)  # tanh derivative

            # Update output layer weights
            prev_activation = activations[-2]
            for j in range(len(prev_activation)):
                evaluator.weights[-1][0][j] += learning_rate * output_grad * prev_activation[j]
            evaluator.biases[-1][0] += learning_rate * output_grad

            # Hidden layers (backpropagate)
            layer_grad = [output_grad]

            for layer_idx in range(len(evaluator.weights) - 2, -1, -1):
                new_grad = []
                next_w = evaluator.weights[layer_idx + 1]
                prev_act = activations[layer_idx]
                curr_act = activations[layer_idx + 1]

                for neuron_idx in range(len(evaluator.weights[layer_idx])):
                    # Sum of gradients from next layer
                    grad_sum = 0.0
                    for k in range(len(layer_grad)):
                        grad_sum += layer_grad[k] * next_w[k][neuron_idx]

                    # ReLU derivative
                    if curr_act[neuron_idx] > 0:
                        grad = grad_sum
                    else:
                        grad = 0.0

                    new_grad.append(grad)

                    # Update weights
                    for j in range(len(prev_act)):
                        evaluator.weights[layer_idx][neuron_idx][j] += learning_rate * grad * prev_act[j]
                    evaluator.biases[layer_idx][neuron_idx] += learning_rate * grad

                layer_grad = new_grad

        avg_loss = total_loss / len(training_data)
        if (epoch + 1) % 10 == 0:
            print(f"  Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.6f}")

    evaluator.trained = True
    print("Training complete!")


# Global instance
neural_evaluator = NeuralEvaluator()