"""Build runtime assets from the user-supplied Pal ZIP; no artwork is regenerated."""
from pathlib import Path
import argparse, hashlib, io, json, zipfile
from PIL import Image

PREFIX = "iSdu-Pal-Handoff-20261026/"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    target = root / "miniprogram/assets/companion"
    target.mkdir(parents=True, exist_ok=True)
    entries = []
    with zipfile.ZipFile(args.archive) as archive:
        paths = [n for n in archive.namelist() if "/art/" in n and n.endswith(".png")]
        assert len(paths) == 25, "Expected 22 transparent assets and 3 scenes"
        for path in paths:
            data = archive.read(path)
            source = Image.open(io.BytesIO(data))
            transparent = source.mode == "RGBA"
            image = source.copy()
            image.thumbnail((384, 384) if transparent else ((768, 576) if "/art/scenes/" in path else (1000, 750)), Image.Resampling.LANCZOS)
            filename = Path(path).stem + (".png" if transparent else ".jpg")
            runtime_dir = "assets/companion" if "/characters/" in path else "pages/companion/assets"
            output = root / "miniprogram" / runtime_dir / filename
            output.parent.mkdir(parents=True, exist_ok=True)
            if transparent:
                image.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(output, optimize=True)
            else:
                image.convert("RGB").save(output, quality=70 if "/art/scenes/" in path else 78, optimize=True)
            entries.append({"id": Path(path).stem, "source": path.removeprefix(PREFIX),
                "sourceSha256": hashlib.sha256(data).hexdigest(),
                "runtime": "/" + runtime_dir + "/" + filename, "width": image.width,
                "height": image.height, "alpha": transparent,
                "bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest()})
    manifest = {"source": args.archive.name, "archiveSha256": hashlib.sha256(args.archive.read_bytes()).hexdigest(),
        "method": "Runtime resize and PNG palette/JPEG encode; composition unchanged; original ZIP retained by user",
        "totalBytes": sum(e["bytes"] for e in entries), "assets": entries}
    (root / "docs/COMPANION_ART_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"assets": len(entries), "runtimeBytes": manifest["totalBytes"]}))

if __name__ == "__main__":
    main()
