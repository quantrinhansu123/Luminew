# -*- coding: utf-8 -*-
import json
path = r"C:\Users\Admin\.cursor\projects\d-Luminew\agent-transcripts\c8648db2-9d9a-4215-96bf-d407d8808cd8\c8648db2-9d9a-4215-96bf-d407d8808cd8.jsonl"
# Find all StrReplace on viewNsMoiNhanh related to Alert tab button
with open(path, "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "viewNsMoiNhanh.html" not in line:
            continue
        if "alert-tab-badge" not in line and "AlertReport" not in line and "Cảnh báo" not in line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        for part in obj.get("message", {}).get("content", []):
            if part.get("name") != "StrReplace":
                continue
            inp = part.get("input") or {}
            ns = inp.get("new_string") or ""
            os_ = inp.get("old_string") or ""
            if "alert-tab-badge" in ns or ("AlertReport" in ns and "tablinks" in ns) or ("Cảnh báo" in ns and "tablinks" in ns):
                out = rf"d:\Luminew\scripts\_tmp_tabbtn_{i}.txt"
                with open(out, "w", encoding="utf-8") as w:
                    w.write("=== OLD ===\n")
                    w.write(os_[:8000])
                    w.write("\n=== NEW ===\n")
                    w.write(ns[:8000])
                print("wrote", out, "old", len(os_), "new", len(ns))
