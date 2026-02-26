from fastapi import FastAPI
from fastapi.testclient import TestClient

# Create a simple FastAPI app for testing
app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/items/{item_id}")
def read_item(item_id: int, q: str = None):
    return {"item_id": item_id, "q": q}

# Create a test client
client = TestClient(app)

# Test cases
def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}
    print("✓ Root endpoint test passed")

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
    print("✓ Health check test passed")

def test_read_item():
    response = client.get("/items/42?q=test")
    assert response.status_code == 200
    assert response.json() == {"item_id": 42, "q": "test"}
    print("✓ Read item test passed")

def test_read_item_no_query():
    response = client.get("/items/5")
    assert response.status_code == 200
    assert response.json() == {"item_id": 5, "q": None}
    print("✓ Read item without query test passed")

# Run tests
if __name__ == "__main__":
    print("Running FastAPI tests...\n")
    test_read_root()
    test_health_check()
    test_read_item()
    test_read_item_no_query()
    print("\n✅ All tests passed!")