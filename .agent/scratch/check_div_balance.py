import re

with open('/home/nhatbang/freeland/Luminew/src/pages/AdminTools.jsx', 'r') as f:
    lines = f.readlines()

open_divs = 0
in_auto_assign = False

for i, line in enumerate(lines):
    line_num = i + 1
    if "activeTab === 'auto_assign' && (" in line:
        in_auto_assign = True
        print(f"Starting auto_assign at line {line_num}")
    
    if in_auto_assign:
        opens = len(re.findall(r'<div', line))
        closes = len(re.findall(r'</div', line))
        open_divs += opens - closes
        
        if opens > 0 or closes > 0:
            if 4900 <= line_num <= 4950 or 5250 <= line_num <= 5280:
                print(f"{line_num}: {line.strip()} | Diff: {opens - closes}, Current: {open_divs}")
        
        if ")}" in line:
            if open_divs <= 0:
                print(f"Ending auto_assign at line {line_num} with open_divs={open_divs}")
                in_auto_assign = False
            elif line_num > 5200:
                print(f"Candidate balance at {line_num}: {open_divs}")
