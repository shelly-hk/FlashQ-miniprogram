import urllib.request
import json

url = "https://chatapi.weixin.qq.com/openai/v1/chat/completions"
token = "GTBP9AgBEAEaIAgBEhwxNzg5OTIxODc1MjA4NjM5MTA5NVFYTk50MERsIhgIAxIUCAMSEEfBmXzgX2DkvGdhzYiXIOY="

data = json.dumps({
    "model": "Deepseek-v4-flash",
    "messages": [{"role": "user", "content": "hello"}]
}).encode("utf-8")

# Test 1: token in URL query param
print("=== Test 1: token in URL ===")
req = urllib.request.Request(f"{url}?token={token}", data=data, headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as resp:
        print("OK:", resp.read().decode()[:500])
except Exception as e:
    print("FAIL:", e)
    if hasattr(e, 'read'):
        print("Body:", e.read().decode()[:500])

# Test 2: token in Authorization header
print("\n=== Test 2: Bearer token ===")
req2 = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req2) as resp:
        print("OK:", resp.read().decode()[:500])
except Exception as e:
    print("FAIL:", e)
    if hasattr(e, 'read'):
        print("Body:", e.read().decode()[:500])
