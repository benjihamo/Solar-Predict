/* Sunwise v8.16. The v7 engine remains available in app-v7.js. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const SETTINGS_KEY = "solar-predict-settings-v8";
  const HISTORY_KEY = "solar-predict-history-v1";
  const DEFAULTS = {
    arrays: [{name:"Pergola",kwp:2,tilt:0,azimuth:180},{name:"Garage",kwp:1,tilt:0,azimuth:155}],
    battery:8,minimumSocPct:10,weekdayConsumption:5,weekendConsumption:5,baseLoadW:300,overnightHours:8,efficiency:79,dayPrice:31,nightPrice:9,chargePowerW:1000,cheapRateEnd:"07:00",lat:53.4143,lon:-3.0647
  };
  let arrays = structuredClone(DEFAULTS.arrays);
  let forecastState = null;
  let requestId = 0;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const number = id => Number($(id).value);
  const setStatus = (message,kind="") => { const el=$("status"); el.textContent=message; el.className=`status ${kind}`.trim(); };

  function readSettings() {
    return {
      arrays: arrays.map(a => ({name:String(a.name).trim(),kwp:Number(a.kwp),tilt:Number(a.tilt),azimuth:Number(a.azimuth)})),
      battery:number("battery"),minimumSocPct:number("minimumSocPct"),weekdayConsumption:number("weekdayConsumption"),weekendConsumption:number("weekendConsumption"),baseLoadW:number("baseLoadW"),overnightHours:number("overnightHours"),efficiency:number("efficiency"),
      dayPrice:number("dayPrice"),nightPrice:number("nightPrice"),chargePowerW:number("chargePowerW"),cheapRateEnd:$("cheapRateEnd").value,lat:number("lat"),lon:number("lon")
    };
  }
  function validate(s) {
    if (!s.arrays.length) return "Add at least one set of panels.";
    if (s.arrays.length>4) return "You can add up to four sets of panels.";
    for (let i=0;i<s.arrays.length;i++) {
      const a=s.arrays[i], label=`Panel set ${i+1}`;
      if (!a.name) return `${label}: add a name so you can recognise it.`;
      if (!Number.isFinite(a.kwp)||a.kwp<=0||a.kwp>100) return `${label}: capacity must be greater than 0 and no more than 100 kWp.`;
      if (!Number.isFinite(a.tilt)||a.tilt<0||a.tilt>90) return `${label}: tilt must be between 0° and 90°.`;
      if (!Number.isFinite(a.azimuth)||a.azimuth<0||a.azimuth>360) return `${label}: compass direction must be between 0° and 360°.`;
    }
    const limits={battery:[0,100],minimumSocPct:[0,100],weekdayConsumption:[0,100],weekendConsumption:[0,100],baseLoadW:[0,10000],overnightHours:[1,16],efficiency:[50,100],dayPrice:[0,500],nightPrice:[0,500],chargePowerW:[100,10000],lat:[-90,90],lon:[-180,180]};
    const labels={battery:"Battery size",minimumSocPct:"Minimum battery reserve",weekdayConsumption:"Weekday expected use",weekendConsumption:"Weekend expected use",baseLoadW:"Overnight base load",overnightHours:"Overnight hours",efficiency:"Battery efficiency",dayPrice:"Day rate",nightPrice:"Cheap rate",chargePowerW:"Charge rate",lat:"Latitude",lon:"Longitude"};
    for(const [id,[min,max]] of Object.entries(limits)) { const v=s[id]; if(!Number.isFinite(v)||v<min||v>max)return `${labels[id]} must be between ${min} and ${max}${id.includes("Price")?" p/kWh":""}.`; }
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.cheapRateEnd))return "Cheap-rate end must be a valid time.";
    return "";
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY,JSON.stringify(readSettings())); return true; } catch { setStatus("This browser could not save your settings. Check that site storage is enabled.","error"); return false; } }
  function loadSettings() {
    let s=null, fromV7=false; try{s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");}catch{}
    if(!s) { try{s=JSON.parse(localStorage.getItem("solar-predict-settings-v7")||"null");fromV7=!!s;}catch{} }
    const saved=s||{};
    s={...DEFAULTS,...saved};
    if(!Object.prototype.hasOwnProperty.call(saved,"weekdayConsumption")&&Number.isFinite(Number(saved.dailyConsumption)))s.weekdayConsumption=Number(saved.dailyConsumption);
    if(!Object.prototype.hasOwnProperty.call(saved,"weekendConsumption")&&Number.isFinite(Number(saved.dailyConsumption)))s.weekendConsumption=Number(saved.dailyConsumption);
    delete s.dailyConsumption;
    const dailyDefaultMigration="solar-predict-daily-use-default-v1";
    try { if(!localStorage.getItem(dailyDefaultMigration)){if(s.weekdayConsumption===0)s.weekdayConsumption=5;if(s.weekendConsumption===0)s.weekendConsumption=5;} localStorage.setItem(dailyDefaultMigration,"1"); } catch {}
    if(fromV7){s.dayPrice=Number(s.dayPrice)*100;s.nightPrice=Number(s.nightPrice)*100;}
    if(Array.isArray(s.arrays)&&s.arrays.length) arrays=s.arrays.slice(0,4).map(a=>({...a}));
    for(const id of ["battery","minimumSocPct","weekdayConsumption","weekendConsumption","baseLoadW","overnightHours","efficiency","dayPrice","nightPrice","chargePowerW","cheapRateEnd","lat","lon"]) if($(id))$(id).value=s[id];  }
  function getHistory() { try { const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); return Array.isArray(h)?h.filter(x=>x&&/^\d{4}-\d\d-\d\d$/.test(x.date)&&Number.isFinite(+x.raw)&&+x.raw>0&&Number.isFinite(+x.actual)&&+x.actual>=0).slice(-30):[]; } catch{return [];} }
  function factor() { const h=getHistory(); if(!h.length)return 1; const ratios=h.map(x=>Math.max(.4,Math.min(1.6,+x.actual/+x.raw))).sort((a,b)=>a-b), m=Math.floor(ratios.length/2); return ratios.length%2?ratios[m]:(ratios[m-1]+ratios[m])/2; }
  function renderHistory() {
    const h=getHistory(), f=factor();
    $("calibrationSummary").textContent=h.length?`Forecast adjustment: ${f.toFixed(2)}×, based on ${h.length} saved day${h.length===1?"":"s"}. Changes are gently limited so one unusual day cannot swing the forecast.`:"No readings saved yet. Add a finished day’s total and the forecast will start learning.";
    $("historyBox").innerHTML=h.length?`<table><thead><tr><th>Date</th><th>Forecast</th><th>Actual</th><th>Accuracy</th></tr></thead><tbody>${h.slice().reverse().slice(0,8).map(x=>{const acc=Math.max(0,100-Math.abs(+x.actual- +x.raw)/Math.max(.01,+x.actual)*100);return `<tr><td>${esc(x.date)}</td><td>${(+x.raw).toFixed(1)} kWh</td><td>${(+x.actual).toFixed(1)} kWh</td><td class="accuracy">${acc.toFixed(0)}%</td></tr>`;}).join("")}</tbody></table>`:"";
  }
  function renderArrays() {
    $("arrays").innerHTML=arrays.map((a,i)=>`<article class="array"><div class="array-head"><div><div class="array-title">Panel set ${i+1}</div><h3>${esc(a.name||`Panel set ${i+1}`)}</h3></div>${arrays.length>1?`<button class="btn danger" data-remove="${i}" type="button" aria-label="Remove ${esc(a.name||`panel set ${i+1}`)}">Remove</button>`:""}</div><div class="fields4"><div class="field"><label for="array-name-${i}">Name</label><input id="array-name-${i}" data-i="${i}" data-key="name" maxlength="30" value="${esc(a.name||"")}" autocomplete="off"></div><div class="field"><label for="array-kwp-${i}">Capacity <span class="help">kWp</span></label><input id="array-kwp-${i}" data-i="${i}" data-key="kwp" type="number" min="0.01" max="100" step="0.01" value="${esc(a.kwp)}" inputmode="decimal"></div><div class="field"><label for="array-tilt-${i}">Tilt <span class="help">0° flat · 90° upright</span></label><input id="array-tilt-${i}" data-i="${i}" data-key="tilt" type="number" min="0" max="90" step="1" value="${esc(a.tilt)}" inputmode="numeric"></div><div class="field"><label for="array-azimuth-${i}">Compass direction <span class="help">South 180° · east 90°</span></label><input id="array-azimuth-${i}" data-i="${i}" data-key="azimuth" type="number" min="0" max="360" step="1" value="${esc(a.azimuth)}" inputmode="numeric"></div></div></article>`).join("");
    $("arrays").querySelectorAll("[data-key]").forEach(el=>el.addEventListener("change",()=>{const i=+el.dataset.i,k=el.dataset.key;arrays[i][k]=k==="name"?el.value:Number(el.value);if(k==="name")renderArrays();saveSettings();}));
    $("arrays").querySelectorAll("[data-remove]").forEach(el=>el.addEventListener("click",()=>{arrays.splice(+el.dataset.remove,1);renderArrays();saveSettings();}));
  }
  const azimuthApi = compass => ((compass+180)%360)-180;
  function apiUrl(s,a) { const q=new URLSearchParams({latitude:String(s.lat),longitude:String(s.lon),hourly:"global_tilted_irradiance,temperature_2m",tilt:String(a.tilt),azimuth:String(azimuthApi(a.azimuth)),timezone:"auto",forecast_days:"2"});return `https://api.open-meteo.com/v1/forecast?${q}`; }
  async function fetchArray(s,a,signal) { const r=await fetch(apiUrl(s,a),{signal,cache:"no-store"});if(!r.ok)throw new Error(r.status===429?"The weather service is busy. Wait a moment and try again.":`Weather service error (${r.status}).`);const d=await r.json();if(!Array.isArray(d.hourly?.time)||!Array.isArray(d.hourly?.global_tilted_irradiance))throw new Error("The weather service returned incomplete data. Try again shortly.");return d; }
  function estimate(gti,kwp,temp) { if(!Number.isFinite(+gti))return 0;const tempC=Number.isFinite(+temp)?+temp:15,thermal=1-Math.max(0,tempC-25)*.004;return Math.max(0,kwp*(Math.max(0,+gti)/1000)*.88*thermal); }
  function localDateTime(iso) { return {date:iso.slice(0,10),hour:+iso.slice(11,13),minute:+iso.slice(14,16)}; }
  function consumptionProfile(s,date) {
    const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const dayIndex=new Date(date+"T12:00:00Z").getUTCDay();
    const isWeekend=dayIndex===0||dayIndex===6;
    return {dayName:days[dayIndex],name:isWeekend?"Weekend":"Weekday",kwh:isWeekend?s.weekendConsumption:s.weekdayConsumption,date};
  }
  function chargePlan(s,solarTomorrow,profile) {
    if(s.battery<=0)return {hasBattery:false,reason:"Enter your usable battery size to calculate a target."};
    const capacity=s.battery,solar=Math.max(0,solarTomorrow),consumption=Math.max(0,profile.kwh);
    const overnightUse=s.baseLoadW*s.overnightHours/1000;
    const daytimeUse=Math.max(0,consumption-overnightUse);
    const daytimeShortfall=Math.max(0,daytimeUse-solar);
    const reserveKwh=capacity*s.minimumSocPct/100;
    const rawRequired=overnightUse+reserveKwh+daytimeShortfall;
    const targetSoc=Math.max(s.minimumSocPct,Math.min(100,rawRequired/capacity*100));
    const requiredStored=capacity*targetSoc/100;
    const capacityShortfall=Math.max(0,rawRequired-capacity);
    const whyChanged=daytimeShortfall>0.001
      ? "Target raised by "+daytimeShortfall.toFixed(1)+" kWh because tomorrow’s solar is below expected daytime use."
      : "";
    const reason="Tomorrow uses the "+profile.name.toLowerCase()+" profile for "+profile.dayName+" ("+consumption.toFixed(1)+" kWh expected use). Overnight use is "+overnightUse.toFixed(1)+" kWh, with a "+s.minimumSocPct.toFixed(0)+"% reserve. "+(daytimeShortfall>0.001?"Solar is "+daytimeShortfall.toFixed(1)+" kWh below expected daytime use, so the target includes that shortfall.":"Tomorrow’s "+solar.toFixed(1)+" kWh solar covers expected daytime use, so it does not raise the target.")+" Target: "+targetSoc.toFixed(0)+"% of the "+capacity.toFixed(1)+" kWh battery.";
    return {hasBattery:true,capacity,solar,consumption,profile,overnightUse,daytimeUse,daytimeShortfall,reserveKwh,rawRequired,requiredStored,targetSoc,capacityShortfall,whyChanged,reason};
  }
  function renderForecast(s,meteo) {
    const times=meteo[0].hourly.time, today=times[0].slice(0,10), tomorrow=times.find(t=>t.slice(0,10)!==today)?.slice(0,10);
    if(!tomorrow)throw new Error("Only one forecast day came back. Try refreshing in a minute.");
    const raw=times.map((t,i)=>meteo.reduce((sum,d,j)=>sum+estimate(d.hourly.global_tilted_irradiance[i],s.arrays[j].kwp,d.hourly.temperature_2m?.[i]),0));
    const f=factor(), vals=raw.map(x=>x*f), sumDate=(day,list)=>list.reduce((sum,x,i)=>sum+(times[i].slice(0,10)===day?x:0),0), rawToday=sumDate(today,raw), rawTomorrow=sumDate(tomorrow,raw), a=sumDate(today,vals), b=sumDate(tomorrow,vals), profile=consumptionProfile(s,tomorrow), charge=chargePlan(s,b,profile);
    $("heroValue").textContent=`${a.toFixed(1)} kWh today`;
    $("todayKwh").textContent=`${a.toFixed(1)} kWh`;$("tomorrowKwh").textContent=`${b.toFixed(1)} kWh`;$("value").textContent=`£${(a*s.dayPrice/100).toFixed(2)}`;
    $("batterySizeSummary").textContent=s.battery?`${s.battery.toFixed(1)} kWh`:"No battery";
    $("location").textContent=`${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} · ${meteo[0].timezone||"local time"}`;$("updated").textContent=`Updated ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
    const day=vals.map((v,i)=>({t:times[i],v})).filter(x=>x.t.slice(0,10)===today), peak=Math.max(.05,...day.map(x=>x.v));
    $("hours").innerHTML=day.length?day.filter(x=>x.v>=.005||+x.t.slice(11,13)>=5).map(x=>{const t=localDateTime(x.t),h=`${String(t.hour).padStart(2,"0")}:00`,w=Math.max(1,Math.min(100,x.v/peak*100));return `<div class="hour" role="listitem"><span>${h}</span><div class="track" aria-label="${x.v.toFixed(2)} kilowatt-hours"><div class="fill" style="width:${w}%"></div></div><strong>${x.v.toFixed(2)} kWh</strong></div>`;}).join(""):"<div class=empty>No daylight generation is expected in the available forecast.</div>";
    $("recommendation").innerHTML=charge.hasBattery?"<strong>🌙 Tonight: charge to "+charge.targetSoc.toFixed(0)+"%.</strong> Using tomorrow’s "+profile.name.toLowerCase()+" profile ("+profile.dayName+")."+(charge.whyChanged?" "+charge.whyChanged:""):"<strong>Overnight guide:</strong> Add a battery size to get a target SOC.";
    $("chargeSolar").textContent=b.toFixed(1)+" kWh";
    $("chargeConsumption").textContent=charge.hasBattery?profile.kwh.toFixed(1)+" kWh · "+profile.name+" ("+profile.dayName+")":"—";
    $("chargeOvernight").textContent=charge.hasBattery?charge.overnightUse.toFixed(1)+" kWh":"—";
    $("chargeReason").textContent=charge.reason;
    $("chargeProfile").textContent=charge.hasBattery?charge.whyChanged:"Add a battery size to get a target.";
    $("chargeHeadlineSoc").textContent=charge.hasBattery?charge.targetSoc.toFixed(0)+"%":"—";
    $("chargeSummary").textContent=charge.hasBattery?"Overnight need "+charge.overnightUse.toFixed(1)+" kWh + "+s.minimumSocPct.toFixed(0)+"% reserve. Tomorrow’s expected use: "+profile.kwh.toFixed(1)+" kWh ("+profile.name.toLowerCase()+" profile).":"Enter usable battery size to calculate a target.";
    const warning=$("chargeWarning");
    warning.textContent=charge.hasBattery&&charge.capacityShortfall>0.001?"Battery capacity is insufficient for expected demand by "+charge.capacityShortfall.toFixed(1)+" kWh, even at 100%.": "";
    warning.classList.toggle("hidden",!warning.textContent);
    forecastState={date:today,raw:rawToday,rawTomorrow,solar:a,tomorrow:b,settings:s,charge};
    renderHistory();
    renderTopupDetails();
    setStatus(`Forecast ready. Calibration adjustment: ${f.toFixed(2)}×. Weather changes can make real generation different.`,"ok");
  }
  function formatDuration(hours) {
    const mins=Math.max(0,Math.ceil(hours*60));
    if(!mins)return "None";
    const h=Math.floor(mins/60),m=mins%60;
    return (h?h+" hr"+(h===1?"":"s"):"")+(h&&m?" ":"")+(m?m+" min":"");
  }
  function renderTopupDetails() {
    const ctx=forecastState,socText=$("startingSoc").value.trim(),stored=$("chargeStored"),grid=$("chargeGrid"),cost=$("chargeCost"),duration=$("chargeDuration"),schedule=$("chargeSchedule"),hint=$("startingSocHint");
    if(!ctx||!ctx.charge.hasBattery){stored.textContent="—";grid.textContent="—";cost.textContent="—";duration.textContent="—";schedule.textContent="Add a battery size to calculate charging.";return;}
    if(!socText){stored.textContent="—";grid.textContent="—";cost.textContent="—";duration.textContent="—";schedule.textContent="Enter your current SOC for a top-up and timing estimate.";hint.textContent="Optional. The target above works without this.";hint.className="hint";return;}
    const soc=Number(socText);
    if(!Number.isFinite(soc)||soc<0||soc>100){stored.textContent="—";grid.textContent="—";cost.textContent="—";duration.textContent="—";schedule.textContent="";hint.textContent="Enter a battery level from 0% to 100%.";hint.className="hint status error";return;}
    hint.className="hint";
    const s=ctx.settings,c=ctx.charge,needKwh=Math.max(0,c.capacity*(c.targetSoc-soc)/100),gridKwh=needKwh/(s.efficiency/100),costP=gridKwh*s.nightPrice;
    stored.textContent=needKwh.toFixed(1)+" kWh";
    grid.textContent=gridKwh.toFixed(1)+" kWh";
    cost.textContent="£"+(costP/100).toFixed(2);
    const hours=needKwh<0.005?0:gridKwh/(s.chargePowerW/1000);
    duration.textContent=formatDuration(hours);
    hint.textContent=soc>=c.targetSoc?"Already at or above target — no top-up needed.": "Current "+soc+"% · target "+c.targetSoc.toFixed(0)+"%";
    if(hours===0){schedule.textContent="Already at or above target — no charge needed tonight.";return;}
    const [endHour,endMinute]=s.cheapRateEnd.split(":").map(Number),now=new Date(),end=new Date(now);
    end.setHours(endHour,endMinute,0,0);
    if(end<=now)end.setDate(end.getDate()+1);
    const latestStart=new Date(end.getTime()-hours*3600000);
    const fmt=d=>d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    if(latestStart<=now)schedule.textContent="Start now to finish as close as possible to the cheap-rate end at "+fmt(end)+".";
    else schedule.textContent="Start by "+fmt(latestStart)+" to reach the target before the cheap rate ends at "+fmt(end)+".";
  }
  $("startingSoc").addEventListener("input",renderTopupDetails);
  async function refresh() {
    const s=readSettings(), problem=validate(s);if(problem){setStatus(problem,"error");$("updated").textContent="Check setup";return;}
    saveSettings(); const current=++requestId, controller=new AbortController();setStatus("Getting the latest weather estimate…");$("updated").textContent="Updating…";$("refreshTop").disabled=true;$("refreshTop").setAttribute("aria-busy","true");
    try { const data=await Promise.all(s.arrays.map(a=>fetchArray(s,a,controller.signal)));if(current!==requestId)return;const key=data[0].hourly.time.join("|");if(data.some(d=>d.hourly.time.length!==data[0].hourly.time.length||d.hourly.time.join("|")!==key))throw new Error("Weather forecasts for your panel directions did not line up. Please refresh again.");renderForecast(s,data);$("refreshTop").disabled=false;$("refreshTop").removeAttribute("aria-busy"); }
    catch(e){if(current!==requestId)return;const message=e.name==="AbortError"?"":(e.message||"Could not get the forecast.");setStatus(`${message} Your saved setup is safe. Check your connection and try again.`,"error");$("updated").textContent="Forecast unavailable";$("refreshTop").disabled=false;$("refreshTop").removeAttribute("aria-busy");if(!forecastState)$("heroValue").textContent="Forecast unavailable";}
  }
  $("addArray").addEventListener("click",()=>{if(arrays.length>=4){setStatus("You already have the maximum of four panel sets.","error");return;}arrays.push({name:`Panel set ${arrays.length+1}`,kwp:1,tilt:30,azimuth:180});renderArrays();saveSettings();});
  $("save").addEventListener("click",refresh);
  $("refreshTop").addEventListener("click",refresh);
  $("gps").addEventListener("click",()=>{if(!navigator.geolocation){setStatus("Location is not available in this browser. Enter latitude and longitude instead.","error");return;}setStatus("Waiting for your device location permission…");navigator.geolocation.getCurrentPosition(p=>{$("lat").value=p.coords.latitude.toFixed(4);$("lon").value=p.coords.longitude.toFixed(4);refresh();},e=>{const msg=e.code===1?"Location permission was declined. You can type in your coordinates instead.":"Couldn’t get your location. Check device location is enabled, or type in your coordinates.";setStatus(msg,"error");},{enableHighAccuracy:false,timeout:12000,maximumAge:600000});});
  function renderBatteryLearning(){const estimate=number("baseLoadW")*number("overnightHours")/1000;$("overnightEstimate").textContent=estimate.toFixed(1)+" kWh";$("learningNote").textContent="Starting estimate: "+number("baseLoadW")+" W × "+number("overnightHours")+" hours = "+estimate.toFixed(1)+" kWh.";}
  for(const id of ["baseLoadW","overnightHours"]) $(id).addEventListener("input",renderBatteryLearning);
  for(const id of ["baseLoadW","overnightHours"]) $(id).addEventListener("change",()=>{renderBatteryLearning();saveSettings();refresh();});
  $("recordActual").addEventListener("click",()=>{const actual=Number($("actualToday").value);if(!Number.isFinite(actual)||actual<0||actual>500){setStatus("Enter a real inverter total from 0 to 500 kWh.","error");return;}if(!forecastState){setStatus("Get a forecast first, then save the finished day’s inverter total.","error");return;}const h=getHistory().filter(x=>x.date!==forecastState.date);h.push({date:forecastState.date,raw:forecastState.raw,actual});try{localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(-30)));$("actualToday").value="";renderHistory();setStatus(`Reading saved for ${forecastState.date}. Future forecasts will learn from it.`,"ok");refresh();}catch{setStatus("Could not save the reading. Check that browser storage is enabled.","error");}});
  for(const id of ["battery","weekdayConsumption","weekendConsumption","efficiency","dayPrice","nightPrice","lat","lon"]) $(id).addEventListener("change",saveSettings);
  loadSettings();renderArrays();renderHistory();renderBatteryLearning();refresh();
})();
