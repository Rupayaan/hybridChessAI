"""
Train the neural network evaluator.

Usage:
    python train.py              # Generate data + train
    python train.py --train-only # Train on existing data
"""

import os
import sys
import json
from neural_eval import NeuralEvaluator, train_neural_evaluator
from generate_training_data import generate_training_data


def main():
    train_only = "--train-only" in sys.argv
    data_file = os.path.join(os.path.dirname(__file__), "training_data.json")
    weights_file = os.path.join(os.path.dirname(__file__), "nn_weights.json")

    # Step 1: Generate training data (if needed)
    if not train_only or not os.path.exists(data_file):
        print("=" * 50)
        print("Step 1: Generating training data")
        print("=" * 50)
        generate_training_data(num_games=500, output_file="training_data.json")
    else:
        print("Using existing training data")

    # Step 2: Load training data
    print("\n" + "=" * 50)
    print("Step 2: Loading training data")
    print("=" * 50)
    with open(data_file, "r") as f:
        raw_data = json.load(f)

    training_data = [(item["board"], item["score"]) for item in raw_data]
    print(f"Loaded {len(training_data)} positions")

    # Step 3: Train
    print("\n" + "=" * 50)
    print("Step 3: Training neural network")
    print("=" * 50)
    evaluator = NeuralEvaluator()
    train_neural_evaluator(evaluator, training_data, epochs=100, learning_rate=0.0005)

    # Step 4: Save weights
    print("\n" + "=" * 50)
    print("Step 4: Saving weights")
    print("=" * 50)
    evaluator.save_weights(weights_file)
    print(f"Weights saved to {weights_file}")

    # Step 5: Test
    print("\n" + "=" * 50)
    print("Step 5: Testing")
    print("=" * 50)

    from engine import evaluate_board

    test_board = [
        ["r", "n", "b", "q", "k", "b", "n", "r"],
        ["p", "p", "p", "p", "p", "p", "p", "p"],
        [None, None, None, None, None, None, None, None],
        [None, None, None, None, None, None, None, None],
        [None, None, None, None, None, None, None, None],
        [None, None, None, None, None, None, None, None],
        ["P", "P", "P", "P", "P", "P", "P", "P"],
        ["R", "N", "B", "Q", "K", "B", "N", "R"],
    ]

    classical = evaluate_board(test_board)
    neural = evaluator.evaluate(test_board)
    print(f"Starting position - Classical: {classical}, Neural: {neural:.1f}")
    print(f"(Starting position should be ~0, meaning equal)")

    print("\n✅ Hybrid Chess AI is ready!")
    print("The bot will now use the hybrid engine when you play against it.")


if __name__ == "__main__":
    main()