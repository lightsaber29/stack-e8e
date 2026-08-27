# 로컬 BGE-M3 임베딩 서비스 (127.0.0.1 전용).
# ARCHITECTURE.md 3번: "Embedding service는 독립된 Python 서비스로 구성할 수 있다."
# Privacy: 이 프로세스는 loopback(127.0.0.1)에만 바인딩되고, 외부로 어떤 요청도 보내지 않는다.
# 모델 가중치는 최초 1회 로컬 캐시로 다운로드되며 그 자체는 사용자 데이터 전송이 아니다.
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer

MODEL_NAME = "BAAI/bge-m3"
EMBED_DIM = 1024

app = Flask(__name__)
_model = None


def get_model():
    global _model
    if _model is None:
        print(f"loading model {MODEL_NAME} ...")
        _model = SentenceTransformer(MODEL_NAME)
        print("model loaded")
    return _model


@app.get("/health")
def health():
    return jsonify({"ok": True, "model": MODEL_NAME, "dim": EMBED_DIM})


@app.post("/embed")
def embed():
    body = request.get_json(force=True) or {}
    texts = body.get("texts")
    if not isinstance(texts, list) or not texts:
        return jsonify({"error": "texts (non-empty array) is required"}), 400
    model = get_model()
    vectors = model.encode(texts, normalize_embeddings=True)
    # 원문/vector 전체를 로그로 남기지 않는다. 개수만 기록.
    print(f"[embed] count={len(texts)}")
    return jsonify({"embeddings": [v.tolist() for v in vectors]})


if __name__ == "__main__":
    get_model()  # 기동 시 미리 로딩 → 첫 검색 지연 제거
    # loopback 전용 바인딩 (외부 노출 금지)
    app.run(host="127.0.0.1", port=8788)
