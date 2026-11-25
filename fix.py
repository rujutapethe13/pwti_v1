p='src/components/shared/engine-board-page.tsx'
s=open(p, encoding='utf-8').read()
s=s.replace("const previousTitle = records.find((r) => r.id === itemId)?.title;",
            "const lastSaved = lastSavedTitleRef.current.get(itemId) ?? records.find((r) => r.id === itemId)?.title;")
s=s.replace('if (previousTitle === newName) { console.log("[STEP3-early-return] reason=same-as-current"); return true; }',
            'if (lastSaved === newName) { console.log("[STEP3-early-return] reason=same-as-saved"); return true; }')
open(p,'w', encoding='utf-8').write(s)
print("done")
