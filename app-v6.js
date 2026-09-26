const $ = id => document.getElementById(id);
const KEY = "solar-predict-settings-v6";
const n = (id, d=0) => { const el=$(id), v=el ? +el.value : NaN; return Number.isFinite(v) ? v : d; };

let arrays = [
  {name:"Pergola", kwp:2, tilt:0, azimuth:180},
  {name:"Garage", kwp:1, tilt:0, azimuth:155}
];

function settings(){
  return { arrays, battery:n("battery",8), soc:n("soc",50), minSoc:n("minSoc",10), efficiency:n("efficiency",79),
    dayPrice:n("dayPrice",.31), nightPrice:n("nightPrice",.09), nightStart:n("nightStart",0), nightEnd:n("nightEnd",6),
    nightCharge:$("nightCharge").checked, lat:n("lat",53.4143), lon:n("lon",-3.0647) };
}
function save(){ localStorage.setItem(KEY, JSON.stringify(settings())); }
function load(){
  try { const s=JSON.parse(localStorage.getItem(KEY)||"null"); if(!s)return;
    if(Array.isArray(s.arrays)&&s.arrays.length) arrays=s.arrays.slice(0,4);
    ["battery","soc","minSoc","efficiency","dayPrice","nightPrice","nightStart","nightEnd","lat","lon"].forEach(k=>{if($(k)&&s[k]!=null)$(k).value=s[k]});
    if($("nightCharge"))$("nightCharge").checked=!!s.nightCharge;
  } catch {}
}
function renderArrays(){
  const box=$("arrays"); box.innerHTML="";
  arrays.forEach((a,i)=>{
    const div=document.createElement("div"); div.className="array";
    div.innerHTML=`<div class="row" style="align-items:center"><div><h3 style="margin:0">Array ${i+1}</h3></div>${arrays.length>1?`<button class="secondary remove" data-i="${i}" type="button" style="max-width:110px;padding:9px">Remove</button>`:""}</div>
      <label>Name</label><input data-field="name" data-i="${i}" value="${escapeHtml(a.name||`Array ${i+1}`)}" maxlength="30">
      <div class="grid"><div><label>Capacity (kWp)</label><input data-field="kwp" data-i="${i}" type="number" min="0.01" step="0.01" value="${a.kwp}"></div>
      <div><label>Tilt (°)</label><input data-field="tilt" data-i="${i}" type="number" min="0" max="90" value="${a.tilt}"></div>
      <div><label>Azimuth (°)</label><input data-field="azimuth" data-i="${i}" type="number" min="0" max="360" value="${a.azimuth}"></div></div>`;
    box.appendChild(div);
  });
  box.querySelectorAll("input[data-field]").forEach(el=>el.addEventListener("input",()=>{
    const i=+el.dataset.i, f=el.dataset.field; arrays[i][f]=f==="name"?el.value:+el.value;
  }));
  box.querySelectorAll(".remove").forEach(b=>b.onclick=()=>{arrays.splice(+b.dataset.i,1);renderArrays();});
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}
function openMeteoAzimuth(compass){ return ((compass + 180) % 360) - 180; }
function apiUrl(s, arr){
  const tilt=Math.max(0,Math.min(90,+arr.tilt||0)); const az=openMeteoAzimuth(+arr.azimuth||0);
  const q=new URLSearchParams({latitude:s.lat,longitude:s.lon,hourly:"global_tilted_irradiance,temperature_2m",tilt,azimuth:az,timezone:"auto",forecast_days:"2"});
  return "https://api.open-meteo.com/v1/forecast?"+q.toString();
}
async function getArrayForecast(s,arr){
  const res=await fetch(apiUrl(s,arr),{cache:"no-store"});
  if(!res.ok)throw new Error(`Weather service returned HTTP ${res.status}`);
  const d=await res.json(); if(!d.hourly?.time||!d.hourly?.global_tilted_irradiance)throw new Error("Forecast data was incomplete"); return d;
}
function estimate(gti,kwp,temp){const t=Number.isFinite(+temp)?+temp:15;const tf=1-Math.max(0,t-25)*.004;return Math.max(0,kwp*(Math.max(0,+gti||0)/1000)*.88*tf);}
function cheap(h,s){return s.nightStart<s.nightEnd?h>=s.nightStart&&h<s.nightEnd:h>=s.nightStart||h<s.nightEnd;}
function batterySim(s,vals,times){
  const cap=Math.max(0,s.battery),min=cap*s.minSoc/100,eff=Math.sqrt(Math.max(.5,s.efficiency/100));
  let stored=Math.max(min,Math.min(cap,cap*s.soc/100)),solarToBattery=0,gridCharge=0;
  for(let i=0;i<vals.length;i++){const h=+times[i].slice(11,13);
    if(s.nightCharge&&cheap(h,s)&&cap>0&&stored<cap){const target=cap*.9,input=Math.max(0,Math.min((target-stored)/eff,.5));stored+=input*eff;gridCharge+=input;}
    if(vals[i]>0&&cap>0&&stored<cap){const input=Math.min(vals[i],(cap-stored)/eff);stored+=input*eff;solarToBattery+=input;}
  }
  return {solarToBattery,gridCharge,endSoc:cap?stored/cap*100:0,charged:solarToBattery+gridCharge};
}
function renderError(message){$("status").innerHTML=`<span class="error">${message}</span>`;$("location").textContent="Forecast unavailable";}
async function forecast(){
  const s=settings(); if(!s.arrays.length)return; $("status").textContent="Fetching solar forecast…";
  try{
    const data=await Promise.all(s.arrays.map(a=>getArrayForecast(s,a))); const times=data[0].hourly.time; const dates=times.map(x=>x.slice(0,10));
    const today=dates[0],tomorrow=dates.find(x=>x!==today); const vals=times.map((t,i)=>data.reduce((sum,d,j)=>sum+estimate(d.hourly.global_tilted_irradiance[i],s.arrays[j].kwp,d.hourly.temperature_2m?.[i]),0));
    const total=day=>vals.reduce((sum,v,i)=>sum+(dates[i]===day?v:0),0),a=total(today),b=total(tomorrow),sim=batterySim(s,vals,times);
    $("location").textContent=`${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} • ${data[0].timezone||"local time"}`; $("today").textContent=a.toFixed(2)+" kWh"; $("todayKwh").textContent=a.toFixed(2)+" kWh"; $("tomorrowKwh").textContent=b.toFixed(2)+" kWh"; $("value").textContent="£"+(a*s.dayPrice).toFixed(2); $("batteryCharged").textContent=sim.charged.toFixed(2)+" kWh"; $("solarToBattery").textContent=sim.solarToBattery.toFixed(2)+" kWh"; $("endSoc").textContent=sim.endSoc.toFixed(0)+"%";
    const dayVals=vals.filter((_,i)=>dates[i]===today),max=Math.max(...dayVals,.01);let out=""; times.forEach((t,i)=>{if(dates[i]!==today)return;const v=vals[i],h=t.slice(11,16);if(v<.005&&h<"05:00")return;out+=`<div class="hour"><span>${h}</span><div class="bar"><i style="width:${Math.min(100,v/max*100)}%"></i></div><strong>${v.toFixed(2)} kWh</strong></div>`});
    $("hours").innerHTML=out||"<span class='muted'>No daylight generation expected.</span>"; $("status").innerHTML="<span class='ok'>Updated successfully.</span>";
  }catch(e){renderError(`${e.message}. Check your connection and tap Update forecast again.`);}
}
$("addArray").onclick=()=>{if(arrays.length>=4)return alert("You can add up to 4 arrays.");arrays.push({name:`Array ${arrays.length+1}`,kwp:1,tilt:30,azimuth:180});renderArrays();};
$("save").onclick=()=>{save();forecast();};
$("gps").onclick=()=>{if(!navigator.geolocation)return alert("Location is not supported on this device.");navigator.geolocation.getCurrentPosition(p=>{$("lat").value=p.coords.latitude.toFixed(4);$("lon").value=p.coords.longitude.toFixed(4);save();forecast();},()=>alert("Location permission was not granted."));};
load();renderArrays();forecast();
