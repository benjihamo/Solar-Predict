const $ = id => document.getElementById(id);
const KEY = "solar-predict-settings-v5";
const n = (id, d=0) => { const el=$(id), v=el ? +el.value : NaN; return Number.isFinite(v) ? v : d; };

function settings(){
  return {
    array1kwp:n("array1kwp",2), array1tilt:n("array1tilt",30), array1azimuth:n("array1azimuth",180),
    array2kwp:n("array2kwp",1), array2tilt:n("array2tilt",30), array2azimuth:n("array2azimuth",155),
    battery:n("battery",8), soc:n("soc",50), minSoc:n("minSoc",10), efficiency:n("efficiency",79),
    dayPrice:n("dayPrice",.31), nightPrice:n("nightPrice",.09), nightStart:n("nightStart",0), nightEnd:n("nightEnd",6),
    nightCharge:$("nightCharge").checked, lat:n("lat",53.4143), lon:n("lon",-3.0647)
  };
}
function save(){ localStorage.setItem(KEY, JSON.stringify(settings())); }
function load(){
  try { const s=JSON.parse(localStorage.getItem(KEY)||"null"); if(s) Object.keys(s).forEach(k=>{ if($(k)) $(k).type==="checkbox" ? $(k).checked=!!s[k] : $(k).value=s[k]; }); } catch {}
}

// UI uses normal compass bearings: N=0, E=90, S=180, W=270.
// Open-Meteo uses 0°=South, -90°=East, +90°=West, ±180°=North.
function openMeteoAzimuth(compass){ return ((compass + 180) % 360) - 180; }

function apiUrl(s, arr){
  const tilt=Math.max(0,Math.min(90,arr.tilt));
  const az=openMeteoAzimuth(arr.azimuth);
  const q=new URLSearchParams({
    latitude:s.lat, longitude:s.lon,
    hourly:"global_tilted_irradiance,temperature_2m",
    tilt, azimuth:az, timezone:"auto", forecast_days:"2"
  });
  return "https://api.open-meteo.com/v1/forecast?"+q.toString();
}

async function getArrayForecast(s, arr){
  const res=await fetch(apiUrl(s,arr), {cache:"no-store"});
  if(!res.ok) throw new Error(`Weather service returned HTTP ${res.status}`);
  const d=await res.json();
  if(!d.hourly || !Array.isArray(d.hourly.time) || !Array.isArray(d.hourly.global_tilted_irradiance)) throw new Error("Forecast data was incomplete");
  return d;
}

function estimateFromGTI(gti, kwp, temp){
  // GTI is W/m² incident on the actual panel plane. Convert to kWh for each hourly step.
  // 88% is the current system-level derate placeholder; calibration will replace it.
  const t=Number.isFinite(+temp) ? +temp : 15;
  const tempFactor=1-Math.max(0,t-25)*0.004;
  return Math.max(0, kwp*(Math.max(0,+gti||0)/1000)*0.88*tempFactor);
}

function cheap(h,s){ return s.nightStart<s.nightEnd ? h>=s.nightStart&&h<s.nightEnd : h>=s.nightStart||h<s.nightEnd; }
function batterySim(s, vals, times){
  const cap=Math.max(0,s.battery), min=cap*s.minSoc/100;
  const eff=Math.sqrt(Math.max(.5,s.efficiency/100));
  let stored=Math.max(min,Math.min(cap,cap*s.soc/100)), solarToBattery=0, gridCharge=0;
  for(let i=0;i<vals.length;i++){
    const h=+times[i].slice(11,13);
    if(s.nightCharge && cheap(h,s) && cap>0 && stored<cap){
      const target=cap*.9, input=Math.max(0,Math.min((target-stored)/eff,.5));
      stored+=input*eff; gridCharge+=input;
    }
    if(vals[i]>0 && cap>0 && stored<cap){
      const input=Math.min(vals[i],(cap-stored)/eff);
      stored+=input*eff; solarToBattery+=input;
    }
  }
  return {solarToBattery,gridCharge,endSoc:cap?stored/cap*100:0,charged:solarToBattery+gridCharge};
}

function renderError(message){
  $("status").innerHTML=`<span class="error">${message}</span>`;
  $("location").textContent="Forecast unavailable";
}

async function forecast(){
  const s=settings();
  $("status").textContent="Fetching solar forecast…";
  try{
    const a1={kwp:s.array1kwp,tilt:s.array1tilt,azimuth:s.array1azimuth};
    const a2={kwp:s.array2kwp,tilt:s.array2tilt,azimuth:s.array2azimuth};
    const [d1,d2]=await Promise.all([getArrayForecast(s,a1),getArrayForecast(s,a2)]);
    const times=d1.hourly.time;
    const dates=times.map(x=>x.slice(0,10));
    const today=dates[0], tomorrow=dates.find(x=>x!==today);
    const vals=times.map((t,i)=>estimateFromGTI(d1.hourly.global_tilted_irradiance[i],a1.kwp,d1.hourly.temperature_2m?.[i]) + estimateFromGTI(d2.hourly.global_tilted_irradiance[i],a2.kwp,d2.hourly.temperature_2m?.[i]));
    const total=day=>vals.reduce((sum,v,i)=>sum+(dates[i]===day?v:0),0);
    const a=total(today), b=total(tomorrow);
    const sim=batterySim(s,vals,times);

    $("location").textContent=`${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} • ${d1.timezone||"local time"}`;
    $("today").textContent=a.toFixed(2)+" kWh";
    $("todayKwh").textContent=a.toFixed(2)+" kWh";
    $("tomorrowKwh").textContent=b.toFixed(2)+" kWh";
    $("value").textContent="£"+(a*s.dayPrice).toFixed(2);
    $("batteryCharged").textContent=sim.charged.toFixed(2)+" kWh";
    $("solarToBattery").textContent=sim.solarToBattery.toFixed(2)+" kWh";
    $("endSoc").textContent=sim.endSoc.toFixed(0)+"%";

    const dayVals=vals.filter((_,i)=>dates[i]===today), max=Math.max(...dayVals,.01);
    let out="";
    times.forEach((t,i)=>{
      if(dates[i]!==today)return;
      const v=vals[i], h=t.slice(11,16);
      if(v<.005&&h<"05:00")return;
      out+=`<div class="hour"><span>${h}</span><div class="bar"><i style="width:${Math.min(100,v/max*100)}%"></i></div><strong>${v.toFixed(2)} kWh</strong></div>`;
    });
    $("hours").innerHTML=out||"<span class='muted'>No daylight generation expected.</span>";
    $("status").innerHTML="<span class='ok'>Updated successfully.</span>";
  }catch(e){
    renderError(`${e.message}. Check your connection and tap Update forecast again.`);
  }
}

$("save").onclick=()=>{save();forecast();};
$("gps").onclick=()=>{
  if(!navigator.geolocation)return alert("Location is not supported on this device.");
  navigator.geolocation.getCurrentPosition(p=>{
    $("lat").value=p.coords.latitude.toFixed(4); $("lon").value=p.coords.longitude.toFixed(4); save(); forecast();
  },()=>alert("Location permission was not granted."));
};

load();
forecast();
