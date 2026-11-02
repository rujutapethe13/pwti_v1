const fs=require('fs');
const p='C:/powerweave-studio-os/src/components/shared/members-access-modal.tsx';
let c=fs.readFileSync(p,'utf8');
const old='    setFormError(null);\r\n  }, [open]);';
const neu='    setFormError(null);\r\n    setAccess("edit");\r\n  }, [open]);';
if(c.includes(old)){c=c.replace(old,neu);fs.writeFileSync(p,c);console.log('ok');}else{console.log('no');}
