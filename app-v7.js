const $ = id => document.getElementById(id);
const KEY = "solar-predict-settings-v7";
const HIST = "solar-predict-history-v1";
const n = (id, d=0) => { const el=$(id), v=el ? +el.value : NaN; return Number.isFinite(v) ? v : d; };

let arrays = [
  {name:"Pergola", kwp:2, tilt:0, azimuth:180},
  {name:"Garage", kwp:1, tilt:0, azimuth:155}
];

let lastRawToday = null;
let lastRawTomorrow = null;
let lastTimes = [];
let lastRawHourly = [];
let lastForecastDate = null;

function settings(){
  return {
    arrays: arrays.map(a=>({name:String(a.name||"Array"),kwp:Math.max(0,+a.kwp||0),tilt:Math.max(0,Math.min(90,+a.tilt||0)),azimuth:((+a.azimuth||0)%360+360)%360})),
    battery:Math.max(0,n("battery",8)),
    soc:Math.max(0,Math.min(100,n("soc",50))),
    minSoc:Math.max(0,Math.min(100,n("minSoc",10))),
    efficiency:Math.max(50,Math.min(100,n("efficiency",79))),
    dayPrice:Math.max(0,n("dayPrice",.31)),
    nightPrice:Math.max(0,n("nightPrice",.09)),
    nightStart:Math.max(0,Math.min(23,n("nightStart",0))),
    nightEnd:Math.max(1,Math.min(24,n("nightEnd",6))),
    nightCharge:$("nightCharge").checked,
    lat:n("lat",53.4143), lon:n("lon",-3.0647)
  };
}

function save(){ try{localStorage.setItem(KEY,JSON.stringify(settings()));}catch{} }

function load(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||"null");
    if(!s)return;
    if(Array.isArray(s.arrays)&&s.arrays.length) arrays=s.arrays.slice(0,4);
    ["battery","soc","minSoc","efficiency","dayPrice","nightPrice","nightStart","nightEnd","lat","lon"].forEach(k=>{if($(k)&&s[k]!=null)$(k).value=s[k]});
    if($("nightCharge"))$("nightCharge").checked=!!s.nightCharge;
  }catch{}
}

function history(){
  try{return JSON.parse(localStorage.getItem(HIST)||"[]").filter(x=>x&&x.date&&Number.isFinite(+x.raw)&&Number.isFinite(+x.actual)).slice(-30);}
  catch{return []}
}
function saveHistory(h){try{localStorage.setItem(HIST,JSON.stringify(h.slice(-30)));}catch{}}

function calibrationFactor(){
  const h=history();
  if(!h.length)return 1;
  const ratios=h.map(x=>Math.max(.4,Math.min(1.6,x.actual/x.raw))).sort((a,b)=>a-b);
  const mid=Math.floor(ratios.length/2);
  return ratios.length%2?ratios[mid]:(ratios[mid-1]+ratios[mid])/2;
}

function renderCalibration(){
  const h=history(), f=calibrationFactor();
  const summary=$("calibrationSummary");
  if(!h.length){
    summary.textContent="No calibration data yet. Your first actual result will become the baseline.";
    $("historyBox").innerHTML="";
    return;
  }
  summary.innerHTML=`Calibration factor: <strong>${f.toFixed(3)}×</strong> from ${h.length} day${h.length===1?"":"s"}. Future forecasts are adjusted automatically.`;
  let rows=h.slice().reverse().slice(0,10).map(x=>{
    const acc=Math.max(0,100-Math.abs(x.actual-x.raw)/Math.max(.01,x.actual)*100);
    const cls=acc>=95?"good":acc>=85?"warn":"danger";
    return `<tr><td>${x.date}</td><td>${(+x.raw).toFixed(2)}</td><td>${(+x.actual).toFixed(2)}</td><td class="${cls}">${acc.toFixed(0)}%</td></tr>`;
  }).join("");
  $("historyBox").innerHTML=`<table class="history"><thead><tr><th>Date</th><th>Forecast</th><th>Actual</th><th>Accuracy</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderArrays(){
  const box=$("arrays"); box.innerHTML="";
  arrays.forEach((a,i)=>{
    const div=document.createElement("div"); div.className="array";
    div.innerHTML=`<div class="row" style="align-items:center"><div><h3>Array ${i+1}</h3></div>${arrays.length>1?`<button class="secondary remove" data-i="${i}" type="button" style="max-width:110px;padding:9px">Remove</button>`:""}</div>
      <label>Name</label><input data-field="name" data-i="${i}" value="${escapeHtml(a.name||`Array ${i+1}`)}" maxlength="30">
      <div class="grid"><div><label>Capacity (kWp)</label><input data-field="kwp" data-i="${i}" type="number" min="0.01" step="0.01" value="${a.kwp}"></div>
      <div><label>Tilt (°)</label><input data-field="tilt" data-i="${i}" type="number" min="0" max="90" value="${a.tilt}"></div>
      <div><label>Azimuth (°)</label><input data-field="azimuth" data-i="${i}" type="number" min="0" max="360" value="${a.azimuth}"></div></div>`;
    box.appendChild(div);
  });
  box.querySelectorAll("input[data-field]").forEach(el=>el.addEventListener("input",()=>{
    const i=+el.dataset.i, f=el.dataset.field;
    arrays[i][f]=f==="name"?el.value:+el.value;
    save();
  }));
  box.querySelectorAll(".remove").forEach(b=>b.onclick=()=>{arrays.splice(+b.dataset.i,1);renderArrays();save();});
}

function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}
function openMeteoAzimuth(compass){return ((compass+180)%360)-180;}
function apiUrl(s,arr){
  const tilt=Math.max(0,Math.min(90,+arr.tilt||0)), az=openMeteoAzimuth(+arr.azimuth||0);
  const q=new URLSearchParams({latitude:s.lat,longitude:s.lon,hourly:"global_tilted_irradiance,temperature_2m",tilt,azimuth:az,timezone:"auto",forecast_days:"2"});
  return "https://api.open-meteo.com/v1/forecast?"+q.toString();
}
async function getArrayForecast(s,arr){
  const res=await fetch(apiUrl(s,arr),{cache:"no-store"});
  if(!res.ok)throw new Error(`Weather service returned HTTP ${res.status}`);
  const d=await res.json();
  if(!d.hourly?.time||!d.hourly?.global_tilted_irradiance)throw new Error("Forecast data was incomplete");
  return d;
}
function estimate(gti,kwp,temp){
  const t=Number.isFinite(+temp)?+temp:15, tf=1-Math.max(0,t-25)*.004;
  return Math.max(0,kwp*(Math.max(0,+gti||0)/1000)*.88*tf);
}
function cheap(h,s){return s.nightStart<s.nightEnd?h>=s.nightStart&&h<s.nightEnd:h>=s.nightStart||h<s.nightEnd;}

function batterySimForDay(s,vals,times,targetDate){
  const cap=Math.max(0,s.battery), min=cap*s.minSoc/100;
  if(cap<=0)return {solarToBattery:0,gridCharge:0,endSoc:0,charged:0};
  const eff=Math.sqrt(Math.max(.5,s.efficiency/100));
  let stored=Math.max(min,Math.min(cap,cap*s.soc/100)), solarToBattery=0, gridCharge=0;
  for(let i=0;i<vals.length;i++){
    if(times[i].slice(0,10)!==targetDate)continue;
    const h=+times[i].slice(11,13);
    if(s.nightCharge&&cheap(h,s)&&stored<cap){
      const target=cap*.9;
      const input=Math.min(.5,Math.max(0,(target-stored)/eff));
      stored+=input*eff; gridCharge+=input;
    }
    if(vals[i]>0&&stored<cap){
      const input=Math.min(vals[i],Math.max(0,(cap-stored)/eff));
      stored+=input*eff; solarToBattery+=input;
    }
  }
  return {solarToBattery,gridCharge,endSoc:stored/cap*100,charged:solarToBattery};
}

function renderError(message){
  $("status").innerHTML=`<span class="error">${message}</span>`;
  $("location").textContent="Forecast unavailable";
}

async function forecast(){
  const s=settings();
  if(!s.arrays.length){renderError("Add at least one solar array.");return;}
  $("status").textContent="Fetching solar forecast…";
  try{
    const data=await Promise.all(s.arrays.map(a=>getArrayForecast(s,a)));
    const times=data[0].hourly.time, dates=times.map(x=>x.slice(0,10));
    const today=dates[0], tomorrow=dates.find(x=>x!==today);
    const rawVals=times.map((t,i)=>data.reduce((sum,d,j)=>sum+estimate(d.hourly.global_tilted_irradiance[i],s.arrays[j].kwp,d.hourly.temperature_2m?.[i]),0));
    const factor=calibrationFactor();
    const vals=rawVals.map(v=>v*factor);
    const total=day=>vals.reduce((sum,v,i)=>sum+(dates[i]===day?v:0),0);
    const rawToday=rawVals.reduce((sum,v,i)=>sum+(dates[i]===today?v:0),0);
    const rawTomorrow=rawVals.reduce((sum,v,i)=>sum+(dates[i]===tomorrow?v:0),0);
    const a=total(today), b=total(tomorrow);
    const sim=batterySimForDay(s,vals,times,today);

    lastRawToday=rawToday; lastRawTomorrow=rawTomorrow; lastTimes=times; lastRawHourly=rawVals; lastForecastDate=today;

    $("location").textContent=`${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} • ${data[0].timezone||"local time"}`;
    $("today").textContent=a.toFixed(2)+" kWh";
    $("todayKwh").textContent=a.toFixed(2)+" kWh";
    $("tomorrowKwh").textContent=b.toFixed(2)+" kWh";
    $("value").textContent="£"+(a*s.dayPrice).toFixed(2);
    $("batteryCharged").textContent=sim.solarToBattery.toFixed(2)+" kWh";
    $("solarToBattery").textContent=sim.solarToBattery.toFixed(2)+" kWh";
    $("endSoc").textContent=sim.endSoc.toFixed(0)+"%";

    const dayVals=vals.filter((_,i)=>dates[i]===today), max=Math.max(...dayVals,.01);
    let out="";
    times.forEach((t,i)=>{
      if(dates[i]!==today)return;
      const v=vals[i],h=t.slice(11,16);
      if(v<.005&&h<"05:00")return;
      out+=`<div class="hour"><span>${h}</span><div class="bar"><i style="width:${Math.min(100,v/max*100)}%"></i></div><strong>${v.toFixed(2)} kWh</strong></div>`;
    });
    $("hours").innerHTML=out||"<span class='muted'>No daylight generation expected.</span>";
    $("status").innerHTML=`<span class='ok'>Updated successfully${factor===1?"":" • calibrated "+factor.toFixed(3)+"×"}.</span>`;
    renderCalibration();
  }catch(e){
    renderError(`${e.message}. Check your connection and tap Update forecast again.`);
  }
}

$("addArray").onclick=()=>{
  if(arrays.length>=4){alert("You can add up to 4 arrays.");return;}
  arrays.push({name:`Array ${arrays.length+1}`,kwp:1,tilt:30,azimuth:180});
  renderArrays();save();
};

$("save").onclick=()=>{save();forecast();};

$("gps").onclick=()=>{
  if(!navigator.geolocation){alert("Location is not supported on this device.");return;}
  navigator.geolocation.getCurrentPosition(p=>{
    $("lat").value=p.coords.latitude.toFixed(4); $("lon").value=p.coords.longitude.toFixed(4);
    save(); forecast();
  },()=>alert("Location permission was not granted."));
};

$("recordActual").onclick=()=>{
  const actual=+$("actualToday").value;
  if(!Number.isFinite(actual)||actual<0){alert("Enter the actual solar generation in kWh.");return;}
  if(lastRawToday==null||!lastForecastDate){alert("Update the forecast first.");return;}
  const h=history().filter(x=>x.date!==lastForecastDate);
  h.push({date:lastForecastDate,raw:lastRawToday,actual:+actual});
  saveHistory(h);
  $("actualToday").value="";
  renderCalibration();
  forecast();
};

load();
renderArrays();
renderCalibration();
forecast();
