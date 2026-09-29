/* Sunwise portable battery-flow CSV reader. Data stays in this browser. */
(() => {
  "use strict";
  const KEY="solar-predict-battery-flow-v1";
  const safeRecord=x=>x&&/^\d{4}-\d\d-\d\d$/.test(x.date)&&Number.isFinite(+x.bedtimeSocPct)&&+x.bedtimeSocPct>=0&&+x.bedtimeSocPct<=100&&Number.isFinite(+x.overnightUseKwh)&&+x.overnightUseKwh>=0&&Number.isFinite(+x.coverageMinutes)&&+x.coverageMinutes>=120;
  const get=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(v)?v.filter(safeRecord).slice(-30):[];}catch{return[];}};
  const parseLine=line=>{const out=[];let v="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&q&&line[i+1]==='"'){v+='"';i++;}else if(c==='"')q=!q;else if(c===","&&!q){out.push(v.trim());v="";}else v+=c;}out.push(v.trim());return out;};
  const dateKey=t=>t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0");
  function parse(text){
    const lines=String(text).replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
    if(lines.length<3)throw new Error("The CSV needs a header and at least two readings.");
    const h=parseLine(lines[0]).map(x=>x.toLowerCase()),ix={time:h.indexOf("timestamp"),soc:h.indexOf("soc_percent"),w:h.indexOf("battery_discharge_w")};
    if(Object.values(ix).some(x=>x<0))throw new Error("Use CSV columns timestamp, soc_percent and battery_discharge_w.");
    const rows=lines.slice(1).map((line,n)=>{const c=parseLine(line),t=new Date(c[ix.time]),soc=Number(c[ix.soc]),w=Number(c[ix.w]);if(!Number.isFinite(t.getTime())||!Number.isFinite(soc)||soc<0||soc>100||!Number.isFinite(w)||w<0||w>100000)throw new Error("Invalid time, charge level or discharge power on row "+(n+2)+".");return{t,soc,w};}).sort((a,b)=>a.t-b.t);
    const records=[];
    for(const date of [...new Set(rows.map(x=>dateKey(x.t)))]){const [y,m,d]=date.split("-").map(Number),start=new Date(y,m-1,d,22),end=new Date(y,m-1,d+1,6),bed=rows.filter(x=>dateKey(x.t)===date).sort((a,b)=>Math.abs(a.t-start)-Math.abs(b.t-start))[0];if(!bed||Math.abs(bed.t-start)>90*60000)continue;
      let kwh=0,coverage=0;
      for(let i=0;i<rows.length-1;i++){const a=rows[i],b=rows[i+1],gap=b.t-a.t;if(gap<=0||gap>15*60000)continue;const lo=Math.max(a.t.getTime(),start.getTime()),hi=Math.min(b.t.getTime(),end.getTime());if(hi>lo){coverage+=(hi-lo)/60000;kwh+=a.w*(hi-lo)/3600000/1000;}}
      if(coverage>=120)records.push({date,bedtimeSocPct:bed.soc,overnightUseKwh:+kwh.toFixed(3),coverageMinutes:Math.round(coverage)});
    }
    if(!records.length)throw new Error("No complete nights found. Include a charge reading near 22:00 and regular discharge readings through 06:00.");
    return records.slice(-30);
  }
  function importText(text){const rows=parse(text),old=get(),merged=[...old.filter(x=>!rows.some(y=>y.date===x.date)),...rows].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);localStorage.setItem(KEY,JSON.stringify(merged));return rows.length;}
  function profile(){const rows=get().slice(-7);if(!rows.length)return null;const median=values=>{const a=values.slice().sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};return{nights:rows.length,bedtimeSocPct:median(rows.map(x=>+x.bedtimeSocPct)),overnightUseKwh:rows.reduce((s,x)=>s+(+x.overnightUseKwh),0)/rows.length};}
  function download(name,content){const u=URL.createObjectURL(new Blob([content],{type:"text/csv"})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function downloadTemplate(){download("sunwise-battery-flow-template.csv","timestamp,soc_percent,battery_discharge_w\n");}
  function downloadSummary(){const rows=get();download("sunwise-battery-flow-history.csv","date,bedtime_soc_percent,overnight_battery_use_kwh,coverage_minutes\n"+rows.map(x=>[x.date,x.bedtimeSocPct,x.overnightUseKwh,x.coverageMinutes].join(",")).join("\n")+"\n");}
  window.BatteryFlow={get,profile,import:importText,downloadTemplate,downloadSummary};
})();