const $ = id => document.getElementById(id);
const KEY = "solar-predict-settings";

function settings(){
  return {
    kwp:+$("kwp").value, price:+$("price").value,
    tilt:+$("tilt").value, azimuth:+$("azimuth").value,
    lat:+$("lat").value, lon:+$("lon").value
  };
}
function save(){localStorage.setItem(KEY,JSON.stringify(settings()));}
function load(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY));
    if(s) Object.keys(s).forEach(k=>{if($(k)) $(k).value=s[k]});
  }catch{}
}

/* Simple first-pass PV model. We will calibrate this against real production data. */
function estimate(r,s){
  const ghi=Math.max(0,r.shortwave_radiation||0);
  const cloud=Math.max(0,Math.min(1,(r.cloud_cover||0)/100));
  const temp=r.temperature_2m ?? 15;
  const tempLoss=1-Math.max(0,temp-25)*0.004;
  const cloudFactor=1-0.12*cloud;
  const systemEfficiency=0.88;
  return Math.max(0,s.kwp*(ghi/1000)*systemEfficiency*cloudFactor*tempLoss);
}

async function forecast(){
  const s=settings();
  $("status").textContent="Fetching forecast…";
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude="+s.lat+
    "&longitude="+s.lon+
    "&hourly=shortwave_radiation,cloud_cover,temperature_2m"+
    "&timezone=auto&forecast_days=2";

  try{
    const res=await fetch(url);
    if(!res.ok) throw new Error("Weather service unavailable");
    const d=await res.json();

    $("location").textContent=s.lat.toFixed(4)+", "+s.lon.toFixed(4)+" • "+d.timezone;

    const vals=d.hourly.time.map((_,i)=>estimate({
      shortwave_radiation:d.hourly.shortwave_radiation[i],
      cloud_cover:d.hourly.cloud_cover[i],
      temperature_2m:d.hourly.temperature_2m[i]
    },s));

    const dates=d.hourly.time.map(x=>x.slice(0,10));
    const today=dates[0];
    const tomorrow=dates.find(x=>x!==today);
    const total=day=>vals.reduce((a,v,i)=>a+(dates[i]===day?v:0),0);
    const a=total(today), b=total(tomorrow);

    $("todayKwh").textContent=a.toFixed(2)+" kWh";
    $("tomorrowKwh").textContent=b.toFixed(2)+" kWh";
    $("value").textContent="£"+((a+b)*s.price).toFixed(2);
    $("today").textContent=a.toFixed(2)+" kWh";

    const dayVals=vals.filter((_,i)=>dates[i]===today);
    const max=Math.max(...dayVals,.01);
    let html="";
    d.hourly.time.forEach((t,i)=>{
      if(dates[i]!==today) return;
      const v=vals[i], h=t.slice(11,16);
      if(v<0.005 && h<"05:00") return;
      html += "<div class='hour'><span>"+h+"</span><div class='bar'><i style='width:"+
        Math.min(100,v/max*100)+"%'></i></div><strong>"+v.toFixed(2)+" kWh</strong></div>";
    });
    $("hours").innerHTML=html || "<span class='muted'>No daylight generation expected.</span>";
    $("status").innerHTML="<span class='ok'>Updated successfully.</span>";
  }catch(e){
    $("status").innerHTML="<span class='error'>"+e.message+"</span>";
  }
}

$("save").onclick=()=>{save();forecast();};
$("gps").onclick=()=>{
  if(!navigator.geolocation){alert("Location is not supported on this device.");return;}
  navigator.geolocation.getCurrentPosition(
    p=>{
      $("lat").value=p.coords.latitude.toFixed(4);
      $("lon").value=p.coords.longitude.toFixed(4);
      save(); forecast();
    },
    ()=>alert("Location permission was not granted.")
  );
};

load();
forecast();
