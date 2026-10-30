"""Build the user's 12-item decor expansion as runtime PNG/JPEG assets."""
from pathlib import Path
import argparse, hashlib, io, json, zipfile
from PIL import Image
PREFIX = "iSdu-SDU-Decor-Expansion-20261026/"

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive",type=Path)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    target=root/"miniprogram/pages/companion/assets"
    target.mkdir(parents=True,exist_ok=True)
    entries=[]
    with zipfile.ZipFile(args.archive) as archive:
        paths=[n for n in archive.namelist() if "/art/" in n and n.endswith(".png")]
        assert len(paths)==14,"Expected twelve props and two scene references"
        for path in paths:
            data=archive.read(path)
            source=Image.open(io.BytesIO(data))
            transparent=source.mode=="RGBA"
            image=source.copy();image.thumbnail((384,384) if transparent else (768,576),Image.Resampling.LANCZOS)
            filename=Path(path).stem+(".png" if transparent else ".jpg")
            output=target/filename
            if transparent:image.quantize(colors=128,method=Image.Quantize.FASTOCTREE).save(output,optimize=True)
            else:image.convert("RGB").save(output,quality=70,optimize=True)
            entries.append({"id":Path(path).stem,"source":path.removeprefix(PREFIX),"sourceSha256":hashlib.sha256(data).hexdigest(),"runtime":"/pages/companion/assets/"+filename,"width":image.width,"height":image.height,"alpha":transparent,"bytes":output.stat().st_size,"sha256":hashlib.sha256(output.read_bytes()).hexdigest()})
    manifest={"source":args.archive.name,"archiveSha256":hashlib.sha256(args.archive.read_bytes()).hexdigest(),"method":"Runtime resize and encoding only; original composition unchanged","totalBytes":sum(a["bytes"] for a in entries),"assets":entries}
    (root/"docs/COMPANION_DECOR_EXPANSION_MANIFEST.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"assets":len(entries),"runtimeBytes":manifest["totalBytes"]}))

if __name__=="__main__":main()
