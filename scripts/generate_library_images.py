"""Génère les photos des recettes de la bibliothèque avec l'API d'images d'OpenAI.

Outil pour les mainteneurs (il n'est pas utilisé par l'intégration) :
    OPENAI_API_KEY=... python3 scripts/generate_library_images.py [slug ...]
Sans argument, seules les images manquantes sont générées. Nécessite Pillow.
"""
import base64, io, json, os, sys, time, concurrent.futures as cf
from pathlib import Path
import urllib.request, urllib.error
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "custom_components" / "frigo_malin"
LIB = ROOT / "library" / "recettes.json"
OUT = ROOT / "frontend" / "library"
API_KEY = os.environ.get("OPENAI_API_KEY", "proxy-injected")
MODEL = "gpt-image-2"

CONTAINER = {"soup": "in a ceramic soup bowl", "salad": "in a wide shallow bowl", "breakfast": "in a bowl or on a small plate",
             "dessert": "on a dessert plate or in a small dish", "main": "on a ceramic plate"}

def prompt(r):
    ings = ", ".join(i.split(" de ")[-1].split(" d'")[-1] for i in r["ingredients"][:6])
    return (
        f"Realistic, appetizing food photograph of a homemade French dish: \"{r['title']}\". {r['description']} "
        f"Key ingredients visible: {ings}. Served {CONTAINER.get(r['type'], 'on a plate')} on a light natural wood table "
        "with a linen napkin, soft natural window daylight, 45-degree angle, shallow depth of field, fresh herbs as garnish, "
        "warm and healthy home-cooking mood, editorial magazine style. No text, no labels, no people, no hands, no watermark."
    )

def generate(r):
    path = f"{OUT}/{r['slug']}.webp"
    body = json.dumps({"model": MODEL, "prompt": prompt(r), "size": "1536x1024", "quality": "medium", "n": 1}).encode()
    for attempt in range(3):
        req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body, method="POST",
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"})
        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                data = json.load(resp)
            img = Image.open(io.BytesIO(base64.b64decode(data["data"][0]["b64_json"]))).convert("RGB")
            img.thumbnail((960, 640))
            img.save(path, "WEBP", quality=80, method=6)
            return r["slug"], "ok"
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(20 * (attempt + 1)); continue
            return r["slug"], f"HTTP {e.code} {msg}"
        except Exception as e:  # noqa: BLE001
            if attempt < 2:
                time.sleep(10); continue
            return r["slug"], f"erreur {e}"

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    recipes = json.load(open(LIB, encoding="utf-8"))["recipes"]
    wanted = sys.argv[1:]
    if wanted:
        todo = [r for r in recipes if r["slug"] in wanted]
    else:
        todo = [r for r in recipes if not (OUT / f"{r['slug']}.webp").exists()]
    print(len(todo), "image(s) à générer", flush=True)
    with cf.ThreadPoolExecutor(4) as pool:
        for slug, status in pool.map(generate, todo):
            print(slug, status, flush=True)
