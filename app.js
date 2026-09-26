const $=id=>document.getElementById(id),KEY="solar-predict-settings-v3";
const n=(id,d=0)=>{const el=$(id),v=el?+el.value:NaN;return Number.isFinite(v)?v:d};
function settings(){return{array1kwp:n("array1kwp",2),array1tilt:n("array1tilt",30),array1azimuth:n("array1azimuth",180),array2kwp:n("array2kwp",1),array2tilt:n("array2tilt",30),array2azimuth:n("array2azimuth",155),battery:n("battery",8),soc:n("soc",50),minSoc:n("minSoc",10),efficiency:n("efficiency",79),dayPrice:n("dayPrice",.31),nightPrice:n("nightPrice",.09),nightStart:n("nightStart",0),nightEnd:n("nightEnd",6),nightCharge:$("nightCharge").checked,lat:n("lat",53.4143),lon:n("lon",-3.0647)}}
function save(){localStorage.setItem(KEY,JSON.stringify(settings()))}
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||"null");if(s)Object.keys(s).forEach(k=>{if($(k))$(k).type==="checkbox"?$(k).checked=!!s[k]:$(k).value=s[k]})}catch{}}
// Estimate PV output from GHI plus panel tilt/azimuth. Azimuth: 0=N, 90=E, 180=S, 270=W.
function solarPosition(time,lat,lon){
  const d=new Date(time); const jd=d.getTime()/86400000+2440587.5; const n=jd-2451545.0;
  const L=(280.46+0.9856474*n)%360, g=(357.528+0.9856003*n)%360, gr=g*Math.PI/180;
  const lam=(L+1.915*Math.sin(gr)+0.020*Math.sin(2*gr))*Math.PI/180;
  const eps=(23.439-0.0000004*n)*Math.PI/180;
  const dec=Math.asin(Math.sin(eps)*Math.sin(lam));
  const ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam));
  const dayStart=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  const hours=(d-dayStart)/3600000;
  const gst=(6.697374558+0.06570982441908*n+1.00273790935*hours)*15*Math.PI/180;
  const H=((gst+lon*Math.PI/180-ra+Math.PI)%(2*Math.PI))-Math.PI;
  const latr=lat*Math.PI/180;
  const cosz=Math.sin(latr)*Math.sin(dec)+Math.cos(latr)*Math.cos(dec)*Math.cos(H);
  const z=Math.acos(Math.max(-1,Math.min(1,cosz)));
  const az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(latr)-Math.tan(dec)*Math.cos(latr))+Math.PI;
  return {zenith:z,azimuth:(az*180/Math.PI+360)%360};
}
function poaIrradiance(r,time,lat,lon,tilt,azimuth){
  const ghi=Math.max(0,Number(r.shortwave_radiation)||0);
  if(ghi<=0)return 0;
  const sun=solarPosition(time,lat,lon), z=sun.zenith, za=z*180/Math.PI;
  if(za>=90)return 0;
  const tiltR=tilt*Math.PI/180, sunAz=sun.azimuth*Math.PI/180, panelAz=azimuth*Math.PI/180;
  const cosInc=Math.cos(z)*Math.cos(tiltR)+Math.sin(z)*Math.sin(tiltR)*Math.cos(sunAz-panelAz);
  const beamFactor=Math.max(0,cosInc)/Math.max(0.08,Math.cos(z));
  // Approximate diffuse fraction from sky conditions. This is intentionally conservative.
  const cloud=Math.max(0,Math.min(1,(Number(r.cloud_cover)||0)/100));
  const diffuseFrac=Math.min(.85,Math.max(.12,.18+.48*cloud));
  const diffuse=ghi*diffuseFrac*(1+Math.cos(tiltR))/2;
  const beam=ghi*(1-diffuseFrac)*beamFactor;
  const ground=ghi*.2*(1-Math.cos(tiltR))/2;
  return Math.max(0,diffuse+beam+ground);
}
function estimate(r,kwp,time,s){
  const poa=poaIrradiance(r,time,s.lat,s.lon,s._tilt,s._azimuth);
  const temp=Number.isFinite(+r.temperature_2m)?+r.temperature_2m:15;
  return Math.max(0,kwp*(poa/1000)*.88*(1-Math.max(0,temp-25)*.004));
}

function batterySim(s,vals,times){const cap=Math.max(0,s.battery),min=cap*s.minSoc/100,eff=Math.sqrt(Math.max(.5,s.efficiency/100));let stored=Math.max(min,Math.min(cap,cap*s.soc/100)),solarToBattery=0,gridCharge=0;for(let i=0;i<vals.length;i++){const pv=vals[i],h=+times[i].slice(11,13);if(s.nightCharge&&cheap(h,s)&&cap>0&&stored<cap){const target=cap*.9;const input=Math.max(0,Math.min((target-stored)/eff,.5));stored+=input*eff;gridCharge+=input}if(pv>0&&cap>0&&stored<cap){const input=Math.min(pv,(cap-stored)/eff);stored+=input*eff;solarToBattery+=input}}return{solarToBattery,gridCharge,endSoc:cap?stored/cap*100:0,charged:solarToBattery+gridCharge}}
function cheap(h,s){return s.nightStart<s.nightEnd?h>=s.nightStart&&h<s.nightEnd:h>=s.nightStart||h<s.nightEnd}
async function forecast(){const s=settings();$("status").textContent="Fetching forecast…";const url="https://api.open-meteo.com/v1/forecast?latitude="+s.lat+"&longitude="+s.lon+"&hourly=shortwave_radiation,cloud_cover,temperature_2m&timezone=auto&forecast_days=2";try{const res=await fetch(url);if(!res.ok)throw Error("Weather service unavailable (HTTP "+res.status+")");const d=await res.json();if(!d.hourly||!d.hourly.time)throw Error("Forecast data was not returned");$("location").textContent=s.lat.toFixed(4)+", "+s.lon.toFixed(4)+" • "+d.timezone;const vals=d.hourly.time.map((_,i)=>{const r={shortwave_radiation:d.hourly.shortwave_radiation[i],cloud_cover:d.hourly.cloud_cover[i],temperature_2m:d.hourly.temperature_2m[i]};return estimate(r,s.array1kwp,d.hourly.time[i],{...s,_tilt:s.array1tilt,_azimuth:s.array1azimuth})+estimate(r,s.array2kwp,d.hourly.time[i],{...s,_tilt:s.array2tilt,_azimuth:s.array2azimuth})}),dates=d.hourly.time.map(x=>x.slice(0,10)),today=dates[0],tomorrow=dates.find(x=>x!==today),total=day=>vals.reduce((a,v,i)=>a+(dates[i]===day?v:0),0),a=total(today),b=total(tomorrow),sim=batterySim(s,vals,d.hourly.time);$("today").textContent=a.toFixed(2)+" kWh";$("todayKwh").textContent=a.toFixed(2)+" kWh";$("tomorrowKwh").textContent=b.toFixed(2)+" kWh";$("value").textContent="£"+(a*s.dayPrice).toFixed(2);$("batteryCharged").textContent=sim.charged.toFixed(2)+" kWh";$("solarToBattery").textContent=sim.solarToBattery.toFixed(2)+" kWh";$("endSoc").textContent=sim.endSoc.toFixed(0)+"%";const dayVals=vals.filter((_,i)=>dates[i]===today),max=Math.max(...dayVals,.01);let out="";d.hourly.time.forEach((t,i)=>{if(dates[i]!==today)return;const v=vals[i],h=t.slice(11,16);if(v<.005&&h<"05:00")return;out+="<div class='hour'><span>"+h+"</span><div class='bar'><i style='width:"+Math.min(100,v/max*100)+"%'></i></div><strong>"+v.toFixed(2)+" kWh</strong></div>"});$("hours").innerHTML=out||"<span class='muted'>No daylight generation expected.</span>";$("status").innerHTML="<span class='ok'>Updated successfully.</span>"}catch(e){$("status").innerHTML="<span class='error'>"+e.message+". Check your connection and try Update forecast again.</span>"}}
$("save").onclick=()=>{save();forecast()};$("gps").onclick=()=>{if(!navigator.geolocation)return alert("Location is not supported on this device.");navigator.geolocation.getCurrentPosition(p=>{$("lat").value=p.coords.latitude.toFixed(4);$("lon").value=p.coords.longitude.toFixed(4);save();forecast()},()=>alert("Location permission was not granted."))};load();forecast();
