const fs = require('fs');
const path = 'C:\\\\powerweave-studio-os\\\\src\\\\components\\\\ui\\\\select.tsx';
let content = fs.readFileSync(path, 'utf8');
const old = "      onClick={(e) => {\r\n        e.preventDefault();\r\n        e.stopPropagation();\r\n        onValueChange(value);\r\n        setOpen(false);\r\n      }}";
const neu = "      onClick={(e) => {\r\n        console.log('SelectItem click', value);\r\n        e.preventDefault();\r\n        e.stopPropagation();\r\n        onValueChange(value);\r\n        setOpen(false);\r\n      }}";
if (!content.includes(old)) {
  console.log('no');
  process.exit(0);
}
content = content.replace(old, neu);
fs.writeFileSync(path, content);
console.log('yes');
