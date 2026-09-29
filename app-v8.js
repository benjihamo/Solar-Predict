/* Sunwise v8.10. The v7 engine remains available in app-v7.js. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const SETTINGS_KEY = "solar-predict-settings-v8";
  const HISTORY_KEY = "solar-predict-history-v1";
  const DEFAULTS = {
    arrays: [{name:"Pergola",kwp:2,tilt:0,azimuth:180},{name:"Garage",kwp:1,tilt:0,azimuth:155}],
    battery:8,dailyConsumption:5,baseLoadW:300,overnightHours:8,efficiency:79,dayPrice:31,nightPrice:9,lat:53.4143,lon:-3.0647
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
      battery:number("battery"),dailyConsumption:number("dailyConsumption"),baseLoadW:number("baseLoadW"),overnightHours:number("overnightHours"),efficiency:number("efficiency"),
      dayPrice:number("dayPrice"),nightPrice:number("nightPrice"),lat:number("lat"),lon:number("lon")
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
    const limits={battery:[0,100],dailyConsumption:[0,100],baseLoadW:[0,10000],overnightHours:[1,16],efficiency:[50,100],dayPrice:[0,500],nightPrice:[0,500],lat:[-90,90],lon:[-180,180]};
    const labels={battery:"Battery size",dailyConsumption:"Daily home use",baseLoadW:"Overnight base load",overnightHours:"Overnight hours",efficiency:"Battery efficiency",dayPrice:"Day rate",nightPrice:"Cheap rate",lat:"Latitude",lon:"Longitude"};
    for(const [id,[min,max]] of Object.entries(limits)) { const v=s[id]; if(!Number.isFinite(v)||v<min||v>max)return `${labels[id]} must be between ${min} and ${max}${id.includes("Price")?" p/kWh":""}.`; }
    return "";
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY,JSON.stringify(readSettings())); return true; } catch { setStatus("This browser could not save your settings. Check that site storage is enabled.","error"); return false; } }
  function loadSettings() {
    let s=null, fromV7=false; try{s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");}catch{}
    if(!s) { try{s=JSON.parse(localStorage.getItem("solar-predict-settings-v7")||"null");fromV7=!!s;}catch{} }
    s={...DEFAULTS,...(s||{})};
    const dailyDefaultMigration="solar-predict-daily-use-default-v1";
    try { if(!localStorage.getItem(dailyDefaultMigration)&&s.dailyConsumption===0)s.dailyConsumption=5; localStorage.setItem(dailyDefaultMigration,"1"); } catch {}
    if(fromV7){s.dayPrice=Number(s.dayPrice)*100;s.nightPrice=Number(s.nightPrice)*100;}
    if(Array.isArray(s.arrays)&&s.arrays.length) arrays=s.arrays.slice(0,4).map(a=>({...a}));
    for(const id of ["battery","dailyConsumption","baseLoadW","overnightHours","efficiency","dayPrice","nightPrice","lat","lon"]) if($(id))$(id).value=s[id];  }
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
  function chargePlan(s,solarTomorrow) {
    if(s.battery<=0)return {hasBattery:false,add:0,gridKwh:0,cost:0,fraction:0,reason:"Enter your battery storage size to get a simple charge estimate."};
    const capacity=s.battery,solar=Math.max(0,solarTomorrow),consumption=Math.max(0,s.dailyConsumption);
    let add,reason;
    const solarUsed=Math.min(solar,consumption),solarAfterUse=solar-solarUsed;
    add=Math.min(capacity,Math.max(0,capacity-solarAfterUse));
    const overnightUse=s.baseLoadW*s.overnightHours/1000;
    reason=solar.toFixed(1)+" kWh solar − "+solarUsed.toFixed(1)+" kWh home use = "+solarAfterUse.toFixed(1)+" kWh left; "+capacity.toFixed(1)+" kWh battery − "+solarAfterUse.toFixed(1)+" kWh left = "+add.toFixed(1)+" kWh to add. Your overnight estimate is "+overnightUse.toFixed(1)+" kWh ("+s.baseLoadW+" W × "+s.overnightHours+" hours); daily home use already includes it, so it is shown separately and not counted twice. Bedtime battery charge is not measured. This is daily-total maths, not hourly modelling.";
    const fraction=capacity?add/capacity*100:0,gridKwh=add/(s.efficiency/100),cost=gridKwh*s.nightPrice/100;
    return {hasBattery:true,add,gridKwh,cost,fraction,solar,consumption,overnightUse,reason};
  }
  function renderForecast(s,meteo) {
    const times=meteo[0].hourly.time, today=times[0].slice(0,10), tomorrow=times.find(t=>t.slice(0,10)!==today)?.slice(0,10);
    if(!tomorrow)throw new Error("Only one forecast day came back. Try refreshing in a minute.");
    const raw=times.map((t,i)=>meteo.reduce((sum,d,j)=>sum+estimate(d.hourly.global_tilted_irradiance[i],s.arrays[j].kwp,d.hourly.temperature_2m?.[i]),0));
    const f=factor(), vals=raw.map(x=>x*f), sumDate=(day,list)=>list.reduce((sum,x,i)=>sum+(times[i].slice(0,10)===day?x:0),0), rawToday=sumDate(today,raw), rawTomorrow=sumDate(tomorrow,raw), a=sumDate(today,vals), b=sumDate(tomorrow,vals),  charge=chargePlan(s,b);
    $("heroValue").textContent=`${a.toFixed(1)} kWh today`;
    $("todayKwh").textContent=`${a.toFixed(1)} kWh`;$("tomorrowKwh").textContent=`${b.toFixed(1)} kWh`;$("value").textContent=`£${(a*s.dayPrice/100).toFixed(2)}`;
    $("batterySizeSummary").textContent=s.battery?`${s.battery.toFixed(1)} kWh`:"No battery";
    $("location").textContent=`${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} · ${meteo[0].timezone||"local time"}`;$("updated").textContent=`Updated ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
    const day=vals.map((v,i)=>({t:times[i],v})).filter(x=>x.t.slice(0,10)===today), peak=Math.max(.05,...day.map(x=>x.v));
    $("hours").innerHTML=day.length?day.filter(x=>x.v>=.005||+x.t.slice(11,13)>=5).map(x=>{const t=localDateTime(x.t),h=`${String(t.hour).padStart(2,"0")}:00`,w=Math.max(1,Math.min(100,x.v/peak*100));return `<div class="hour" role="listitem"><span>${h}</span><div class="track" aria-label="${x.v.toFixed(2)} kilowatt-hours"><div class="fill" style="width:${w}%"></div></div><strong>${x.v.toFixed(2)} kWh</strong></div>`;}).join(""):"<div class=empty>No daylight generation is expected in the available forecast.</div>";
    $("recommendation").innerHTML="<strong>Overnight guide:</strong> Add the amount shown above during the cheap-rate period if your battery has room. The overnight estimate is shown separately. Battery charge is not monitored.";

    $("chargeCapacity").textContent=charge.hasBattery?s.battery.toFixed(1)+" kWh":"—";
    $("chargeSolar").textContent=b.toFixed(1)+" kWh";$("chargeConsumption").textContent=s.dailyConsumption.toFixed(1)+" kWh";
    $("chargeGrid").textContent=charge.hasBattery?charge.gridKwh.toFixed(1)+" kWh":"—";
    $("chargeCost").textContent=charge.hasBattery?"£"+charge.cost.toFixed(2):"—";
    $("chargeReason").textContent=charge.reason;$("chargeProfile").textContent="Overnight estimate: "+charge.overnightUse.toFixed(1)+" kWh. Bedtime charge is not measured.";
    if(!charge.hasBattery){$("chargeAmount").textContent="—";$("chargeCaption").textContent="Add battery storage size";$("chargeSummary").textContent=charge.reason;}
    else if(charge.add>0.05){$("chargeAmount").textContent=charge.add.toFixed(1)+" kWh";$("chargeCaption").textContent="into the battery · about "+charge.fraction.toFixed(0)+"% of capacity";$("chargeSummary").textContent="Add about "+charge.add.toFixed(1)+" kWh overnight. Bedtime charge is not measured.";}
    else{$("chargeAmount").textContent="No top-up";$("chargeCaption").textContent="Solar after home use meets storage estimate";$("chargeSummary").textContent="No cheap-rate top-up suggested by this simple estimate.";}
    forecastState={date:today,raw:rawToday,rawTomorrow,solar:a,tomorrow:b};
    renderHistory();
    setStatus(`Forecast ready. Calibration adjustment: ${f.toFixed(2)}×. Weather changes can make real generation different.`,"ok");
  }
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
  for(const id of ["battery","dailyConsumption","efficiency","dayPrice","nightPrice","lat","lon"]) $(id).addEventListener("change",saveSettings);
  loadSettings();renderArrays();renderHistory();renderBatteryLearning();refresh();
})();
