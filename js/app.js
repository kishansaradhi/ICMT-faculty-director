const MEMBER_STORE_KEY = "icmtFacultyDirectoryMembers_v4";
const USER_STORE_KEY = "icmtFacultyDirectoryUsers_v4";
const MEMBER_DATA_VERSION = "combined-343-members-restored-v5";
const ADMIN_TOKEN_KEY = "icmtAdminApiToken";
let adminApiToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";

function apiBaseUrl(){
  // Local development default also protects admin login if a browser serves a
  // cached admin.html without api-config.js. Production still overrides this
  // through js/api-config.js.
  return String(window.ICMT_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

async function apiRequest(path, options={}){
  const baseUrl=apiBaseUrl();
  if(!baseUrl) throw new Error("The ICMT API URL is not configured.");
  const headers={ Accept:"application/json", ...(options.headers||{}) };
  if(adminApiToken) headers["X-ICMT-Admin-Token"]=adminApiToken;
  const response=await fetch(baseUrl+path,{...options,headers});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.detail||"The ICMT server could not complete the request.");
  return body;
}

async function syncMembersToApi(){
  if(!adminApiToken) return;
  try{
    await apiRequest("/api/admin/members/sync",{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({members})
    });
  }catch(error){
    console.error(error);
    showToast("Changes are saved locally but could not be synced to the server.");
  }
}
try {
  const savedVersion = localStorage.getItem("icmtFacultyDirectoryDataVersion");
  const master = window.ICMT_MASTER_DATA || [];
  if (savedVersion !== MEMBER_DATA_VERSION) {
    localStorage.setItem(MEMBER_STORE_KEY, JSON.stringify(master));
    localStorage.setItem("icmtFacultyDirectoryDataVersion", MEMBER_DATA_VERSION);
  }
} catch(e) {
  localStorage.setItem(MEMBER_STORE_KEY, JSON.stringify(window.ICMT_MASTER_DATA || []));
  localStorage.setItem("icmtFacultyDirectoryDataVersion", MEMBER_DATA_VERSION);
}

let members = loadMembers();
let users = loadUsers();
let editingMemberId = null;
let photoData = "";
let saving = false;



let prototypeRole = "public";

function getPrototypeRole(){
  return prototypeRole;
}

function setPrototypeRole(role){
  prototypeRole = ["public","member","admin"].includes(role) ? role : "public";
  try{ localStorage.setItem("icmtPrototypeRole", prototypeRole); }catch(e){}
  applyRoleAccess();
  if(typeof renderManagement==="function" && document.getElementById("management")?.classList.contains("active")){
    renderManagement();
  }
}

function applyRoleAccess(){
  const role=prototypeRole;
  const pill=$("rolePill");
  const note=$("accessNote");

  if(pill) pill.textContent =
    role==="admin" ? "Administrator Access" :
    role==="member" ? "Member Access" :
    "Public Access";

  if(note) note.textContent =
    role==="admin"
      ? "Full member records and management actions are available."
      : role==="member"
        ? "Member-facing information is available; restricted administrative data is hidden."
        : "Limited member information is visible.";
}

function isAdminRole(){
  return prototypeRole==="admin";
}

function requireAdminRole(){ return true; }

function filterManagementQuality(type){
  const filterSelect=$("managementStatusFilter");
  if(filterSelect){
    if(type==="missing-photos") filterSelect.value="missing-photos";
    else if(type==="missing-info") filterSelect.value="missing-info";
    else if(type==="complete") filterSelect.value="complete";
    else if(type==="with-photos") filterSelect.value="with-photos";
    else filterSelect.value="";
  }
  if(type==="all"){
    const q=$("managementSearch");
    const d=$("managementDesignation");
    if(q) q.value="";
    if(d) d.value="";
  }
  renderManagement();
}

function clearManagementFilters(){
  const q=$("managementSearch");
  const d=$("managementDesignation");
  const s=$("managementStatusFilter");
  if(q) q.value="";
  if(d) d.value="";
  if(s) s.value="";
  renderManagement();
}

function managementNormalizeName(value){
  let s=String(value||"").trim();

  const prefixes=[
    /^lt\.?\s*dr\.?\s+/i,
    /^dr\.?\s+/i,
    /^mr\.?\s+/i,
    /^mrs\.?\s+/i,
    /^ms\.?\s+/i,
    /^miss\s+/i,
    /^prof\.?\s+/i,
    /^professor\s+/i
  ];

  let changed=true;
  while(changed){
    changed=false;
    for(const prefix of prefixes){
      const next=s.replace(prefix,"").trim();
      if(next!==s){
        s=next;
        changed=true;
      }
    }
  }

  // Ignore periods and punctuation when determining the first letter.
  s=s.replace(/[.]/g,"").trim();

  const match=s.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "#";
}


function viewManagementMember(id){
  const member=members.find(m=>String(m.id)===String(id));
  if(!member){ showToast("Member record not found."); return; }

  const modal=$("managementViewModal");
  const content=$("managementViewContent");
  if(!modal || !content){ showToast("Member details view is unavailable."); return; }

  const value=v=>{
    if(v===null||v===undefined||String(v).trim()==="") return "Not specified";
    return Array.isArray(v)?v.join(", "):String(v);
  };
  const field=(label,v,full=false)=>
    '<div class="management-view-field'+(full?' management-view-full':'')+'">'
    +'<div class="label">'+esc(label)+'</div><div class="value">'+esc(value(v))+'</div></div>';

  const photo=member.photo
    ? '<img class="management-view-photo" src="'+member.photo+'" alt="Member photo">'
    : '<div class="management-view-photo management-no-photo">No photo</div>';

  content.innerHTML=
    '<div class="management-view-header">'+photo+
      '<div><h2 style="margin:0 0 5px">'+esc(member.name)+'</h2>'+
      '<div class="subtitle">'+esc(member.designation||"Not specified")+' • '+esc(member.id)+'</div></div>'+
    '</div>'+
    '<div class="management-view-grid">'+
      field("Member ID",member.id)+field("Name",member.name)+
      field("Qualification",member.qualification)+field("Designation",member.designation)+
      field("Department",member.department)+field("Institution / Organization",member.college)+
      field("College Address",member.collegeAddress,true)+
      field("Pincode",member.pincode)+field("Permanent Address Pincode",member.permanentPincode)+
      field("City",member.city)+field("State / Province",member.state)+field("Country",member.country)+
      field("Research Guideship",member.guideship,true)+field("Expertise",member.expertise,true)+
      field("Mobile",member.mobile)+field("WhatsApp",member.whatsapp)+
      field("Professional Email",member.professionalEmail)+field("Personal Email",member.personalEmail)+
      field("LinkedIn",member.linkedin)+field("ORCID",member.orcid)+field("Google Scholar",member.scholar)+
    '</div>';

  modal.style.display="flex";
  modal.setAttribute("aria-hidden","false");
}

function closeManagementMemberView(){
  const modal=$("managementViewModal");
  if(modal){ modal.style.display="none"; modal.setAttribute("aria-hidden","true"); }
}


function updateDataQuality(){
  const total=members.length;

  const complete=members.filter(m=>{
    const required=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ];
    return required.every(v=>String(v??"").trim()!=="");
  }).length;

  const missingPhotos=members.filter(m=>!String(m.photo||"").trim()).length;

  const idCounts={};
  members.forEach(m=>{
    const id=String(m.id||"").trim().toUpperCase();
    if(id) idCounts[id]=(idCounts[id]||0)+1;
  });
  const duplicateIds=Object.values(idCounts).filter(count=>count>1).length;

  const missingFields=members.reduce((count,m)=>{
    const required=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ];
    return count + required.filter(v=>String(v??"").trim()==="").length;
  },0);

  const set=(id,value)=>{
    const el=$(id);
    if(el) el.textContent=String(value);
  };

  set("qualityTotal",total);
  set("qualityComplete",complete);
  set("qualityPhotos",missingPhotos);
  set("qualityMissing",missingFields);
  set("qualityDuplicateIds",duplicateIds);

  const status=$("dataQualityStatus");
  if(status){
    if(missingPhotos===0 && missingFields===0 && duplicateIds===0){
      status.textContent="Healthy";
      status.className="badge green";
    }else{
      status.textContent="Needs Review";
      status.className="badge";
      status.style.background="#fff7ed";
      status.style.color="#9a3412";
    }
  }
}


let importRecords=[];
let importIssues=[];

function openImportDialog(){
  const modal=$("importModal");
  if(!modal)return;
  modal.style.display="flex";
  modal.setAttribute("aria-hidden","false");
  resetImportState();
}
function closeImportDialog(){
  const modal=$("importModal");
  if(modal){modal.style.display="none";modal.setAttribute("aria-hidden","true");}
}
function resetImportState(){
  importRecords=[];importIssues=[];
  const input=$("importFile");if(input)input.value="";
  const name=$("importFileName");if(name)name.textContent="CSV or Excel file";
  ["importSummary","importIssues","importPreviewWrap","importActions"].forEach(id=>$(id)?.classList.add("hidden"));
  const btn=$("importCommitBtn");if(btn)btn.disabled=true;
}
function normalizeImportHeader(v){
  return String(v||"").trim().toLowerCase().replace(/[\s_\-\/]+/g,"").replace(/[()]/g,"");
}
const importFieldAliases={
 id:["id","memberid","icmtid","uniqueid","facultyid"],
 name:["name","membername","facultyname","fullname","facultymember"],
 qualification:["qualification","qualifications","degree"],
 designation:["designation","position","role"],
 department:["department","dept","discipline"],
 college:["college","collegename","institution","institutionorganization","organization","university"],
 collegeAddress:["collegeaddress","institutionaddress","address"],
 pincode:["pincode","pin","postalcode","collegepincode"],
 permanentPincode:["permanentpincode","permanentaddresspincode"],
 city:["city","district"],
 state:["state","stateprovince","province"],
 country:["country","countryname"],
 guideship:["guideship","researchguideship","supervisor","researchsupervisor"],
 expertise:["expertise","researcharea","researchareas","specialization","areaofexpertise"],
 mobile:["mobile","mobilenumber","phone","phonenumber","contact"],
 whatsapp:["whatsapp","whatsappnumber"],
 professionalEmail:["professionalemail","officialemail","workemail","email"],
 personalEmail:["personalemail","alternateemail"],
 linkedin:["linkedin","linkedinprofile","url"],
 orcid:["orcid","orcidprofile","orcidid"],
 scholar:["scholar","googlescholar","googlescholarprofile"],
 photo:["photo","photourl","photoimage","image","imageurl","photopath"]
};

function findImportField(headers,field){
  const aliases=importFieldAliases[field]||[field];
  return headers.find(h=>aliases.includes(normalizeImportHeader(h)))||null;
}

function mapImportRow(row,headers,rowNumber){
  const record={};
  Object.keys(importFieldAliases).forEach(field=>{
    const h=findImportField(headers,field);
    record[field]=h?String(row[h]??"").trim():"";
  });
  if(record.id){
    record.id=String(record.id).trim().toUpperCase();
  }
  return {record,rowNumber};
}

function generateImportNextId(currentMembers, allocatedIds){
  let max=0;
  for(const m of currentMembers){
    const n=parseInt(String(m.id||"").replace(/\D/g,""),10);
    if(Number.isFinite(n)) max=Math.max(max,n);
  }
  for(const id of allocatedIds){
    const n=parseInt(String(id).replace(/\D/g,""),10);
    if(Number.isFinite(n)) max=Math.max(max,n);
  }
  return "ICMT"+String(max+1).padStart(3,"0");
}

function handleImportFile(input){
  const file=input?.files?.[0];if(!file)return;
  $("importFileName").textContent=file.name;
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(ext==="csv"){
    const r=new FileReader();r.onload=()=>processImportRows(parseCSVText(String(r.result||"")));r.readAsText(file);
  }else if(ext==="xlsx"||ext==="xls")loadXLSXForImport(file);
  else showImportIssues(["Unsupported file type. Please select a CSV or Excel file."]);
}

function parseCSVText(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell="";}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell="";if(row.some(v=>String(v).trim()!==""))rows.push(row);row=[];}
    else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);if(row.some(v=>String(v).trim()!==""))rows.push(row);}
  if(!rows.length)return[];
  const headers=rows[0].map(v=>String(v||"").trim());
  return rows.slice(1).map(values=>{const o={};headers.forEach((h,i)=>o[h]=values[i]??"");return o;});
}

function loadXLSXForImport(file){
  if(window.XLSX){readXLSXImportFile(file);return;}
  const existing=document.querySelector('script[data-xlsx-import-loader]');
  if(existing){existing.addEventListener("load",()=>readXLSXImportFile(file),{once:true});return;}
  const script=document.createElement("script");
  script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  script.dataset.xlsxImportLoader="true";
  script.onload=()=>readXLSXImportFile(file);
  script.onerror=()=>showImportIssues(["Excel support could not be loaded. Please use CSV."]);
  document.head.appendChild(script);
}

function readXLSXImportFile(file){
  const r=new FileReader();
  r.onload=e=>{try{
    const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    processImportRows(XLSX.utils.sheet_to_json(sheet,{defval:""}));
  }catch(err){console.error(err);showImportIssues(["The Excel file could not be read."]);}};
  r.readAsArrayBuffer(file);
}

function processImportRows(rows){
  importRecords=[];importIssues=[];
  if(!rows.length){showImportIssues(["The selected file contains no data rows."]);return;}
  const headers=Object.keys(rows[0]||{});
  if(!findImportField(headers,"name")&&!findImportField(headers,"id")){
    showImportIssues(["No recognizable Member ID or Name column was found in the file."]);return;
  }

  const allocatedIds = new Set();
  const seenFileKeys = new Map();
  const seenFileIds = new Map();

  rows.forEach((rawRow, i)=>{
    const rowNumber = i + 2;
    const mapped = mapImportRow(rawRow, headers, rowNumber);
    const r = mapped.record;
    const rawName = String(r.name || '').trim();
    const rawId = String(r.id || '').trim().toUpperCase();
    const email = normalize(r.professionalEmail || r.personalEmail);
    const phone = String(r.mobile || r.whatsapp || '').replace(/\D/g, '');
    const college = normalize(r.college);

    const normName = normalizeMemberNameForMatching(rawName);

    // 1. Validation: Missing name
    if(!rawName || normName.length < 2){
      importRecords.push({
        rowNumber,
        record: r,
        action: "error",
        reason: "Missing faculty name"
      });
      importIssues.push("Row " + rowNumber + ": Missing required faculty name (skipped)");
      return;
    }

    // Auto-match photo if not provided
    if(!r.photo && typeof matchPhotoToMember === "function"){
      const photoMatch = matchPhotoToMember(rawName, members);
      if(photoMatch && photoMatch.member && photoMatch.member.photo){
        r.photo = photoMatch.member.photo;
      }
    }

    // Composite deduplication key
    const personKey = email ? ("email:" + email) : phone && phone.length >= 10 ? ("phone:" + phone) : ("name:" + normName + "|college:" + college);

    // 2. Intra-file duplicate check
    if(rawId && seenFileIds.has(rawId)){
      const firstRow = seenFileIds.get(rawId);
      importRecords.push({
        rowNumber,
        record: r,
        action: "duplicate",
        reason: "Duplicate of Row " + firstRow + " (Same Member ID " + rawId + ")"
      });
      importIssues.push("Row " + rowNumber + ": Duplicate of Row " + firstRow + " (Same Member ID " + rawId + ") — Duplicate filtered out");
      return;
    }

    if(seenFileKeys.has(personKey)){
      const firstRow = seenFileKeys.get(personKey);
      importRecords.push({
        rowNumber,
        record: r,
        action: "duplicate",
        reason: "Duplicate of Row " + firstRow + " (" + rawName + ")"
      });
      importIssues.push("Row " + rowNumber + ": Duplicate of Row " + firstRow + " (" + rawName + ") — Duplicate filtered out");
      return;
    }

    // Register into seen maps for intra-file tracking
    if(rawId) seenFileIds.set(rawId, rowNumber);
    seenFileKeys.set(personKey, rowNumber);

    // 3. Database match detection
    let existing = null;
    let matchReason = "";

    if(rawId){
      existing = members.find(m => String(m.id).toUpperCase() === rawId);
      if(existing) matchReason = "Member ID " + rawId;
    }

    if(!existing && email){
      existing = members.find(m => normalize(m.professionalEmail) === email || normalize(m.personalEmail) === email);
      if(existing) matchReason = "Email (" + email + ")";
    }

    if(!existing && phone && phone.length >= 10){
      existing = members.find(m => String(m.mobile || '').replace(/\D/g, '') === phone);
      if(existing) matchReason = "Phone (" + phone + ")";
    }

    if(!existing && normName.length >= 4){
      existing = members.find(m => {
        const mn = normalizeMemberNameForMatching(m.name);
        const mc = normalize(m.college);
        return mn === normName && (college && mc ? (mc.includes(college) || college.includes(mc)) : true);
      });
      if(existing) matchReason = "Name & Institution match";
    }

    if(existing){
      r.id = existing.id;
      importRecords.push({
        rowNumber,
        record: r,
        action: "update",
        targetId: existing.id,
        reason: "Updates existing member " + existing.id + " (" + existing.name + ") via " + matchReason
      });
    } else {
      // Allocate clean unique sequential ID without collisions
      if(!rawId || !/^ICMT\d{3,}$/.test(rawId) || members.some(m => String(m.id).toUpperCase() === rawId) || allocatedIds.has(rawId)){
        r.id = generateImportNextId(members, allocatedIds);
      } else {
        r.id = rawId;
      }
      allocatedIds.add(r.id);

      importRecords.push({
        rowNumber,
        record: r,
        action: "new",
        targetId: r.id,
        reason: "New unique member (Assigned ID: " + r.id + ")"
      });
    }
  });

  renderImportReview();
}

function renderImportReview(){
  const newRecords = importRecords.filter(x => x.action === "new");
  const updateRecords = importRecords.filter(x => x.action === "update");
  const duplicateRecords = importRecords.filter(x => x.action === "duplicate");
  const errorRecords = importRecords.filter(x => x.action === "error");
  const validTotal = newRecords.length + updateRecords.length;

  const summary=$("importSummary");
  if(summary){
    summary.classList.remove("hidden");
    summary.innerHTML=
      '<div class="import-stat"><div class="label">Total Rows</div><div class="value">'+importRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">New Members</div><div class="value" style="color:#1d754e">'+newRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">Updates (Merged)</div><div class="value" style="color:#126b9b">'+updateRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">Duplicates Removed</div><div class="value" style="color:#b45309">'+duplicateRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">Errors</div><div class="value" style="color:#b91c1c">'+errorRecords.length+'</div></div>';
  }

  const issues=$("importIssues");
  if(issues){
    if(importIssues.length){
      issues.classList.remove("hidden");
      issues.innerHTML='<b>Deduplication & Validation Details:</b><ul>'+importIssues.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>';
    } else {
      issues.classList.add("hidden");
      issues.innerHTML="";
    }
  }

  const wrap=$("importPreviewWrap"),body=$("importPreviewBody");
  if(wrap&&body){
    wrap.classList.remove("hidden");
    body.innerHTML=importRecords.map(x=>{
      const r=x.record;
      const actionBadge = x.action === "new"
        ? '<span class="badge green">New Member</span>'
        : x.action === "update"
          ? '<span class="badge" style="background:#eaf5fb;color:#126b9b">Update (' + esc(x.targetId) + ')</span>'
          : x.action === "duplicate"
            ? '<span class="badge" style="background:#fff7ed;color:#9a3412">Duplicate Filtered</span>'
            : '<span class="badge red">Invalid Row</span>';

      const rowClass = x.action === "duplicate" ? "import-row-error" : x.action === "error" ? "import-row-error" : "";

      return '<tr class="'+rowClass+'">' +
        '<td>'+x.rowNumber+'</td>' +
        '<td>'+actionBadge+'</td>' +
        '<td><b>'+esc(r.id || "Pending")+'</b></td>' +
        '<td>'+esc(r.name||"Not specified")+'</td>' +
        '<td>'+esc(r.designation||"Not specified")+'</td>' +
        '<td>'+esc(r.college||"Not specified")+'</td>' +
        '<td><span style="font-size:12px;color:var(--muted)">'+esc(x.reason)+'</span></td>' +
        '</tr>';
    }).join("");
  }

  $("importActions")?.classList.remove("hidden");
  const btn=$("importCommitBtn");
  if(btn){
    btn.disabled = !validTotal;
    btn.textContent = validTotal ? "Import " + validTotal + " Clean Record" + (validTotal === 1 ? "" : "s") + (duplicateRecords.length ? " (" + duplicateRecords.length + " Duplicates Removed)" : "") : "Import Valid Records";
  }
}

function showImportIssues(messages){
  const issues=$("importIssues");
  if(issues){
    issues.classList.remove("hidden");
    issues.innerHTML='<b>Import could not continue:</b><ul>'+messages.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>';
  }
  $("importPreviewWrap")?.classList.add("hidden");
  $("importActions")?.classList.add("hidden");
}

function commitImport(){
  const validRecords = importRecords.filter(x => x.action === "new" || x.action === "update");
  const duplicateCount = importRecords.filter(x => x.action === "duplicate").length;
  if(!validRecords.length){
    showToast("There are no valid records to import.");
    return;
  }

  let added=0, updated=0;
  validRecords.forEach(x=>{
    const r = { ...x.record, id: String(x.record.id).trim().toUpperCase() };
    const idx = members.findIndex(m => String(m.id||"").toUpperCase() === r.id);
    if(idx >= 0){
      const old = members[idx];
      members[idx] = {
        ...old,
        ...Object.fromEntries(Object.entries(r).filter(([_, v]) => String(v ?? "").trim() !== "")),
        photo: r.photo || old.photo || ""
      };
      updated++;
    } else {
      members.push(r);
      added++;
    }
  });

  persist();
  members = loadMembers();
  updateDashboard();
  renderDirectory();
  renderManagement();
  updateDataQuality();
  closeImportDialog();

  const msg = "Import complete: " + added + " added, " + updated + " updated" + (duplicateCount ? ", " + duplicateCount + " duplicate rows removed." : ".");
  showToast(msg);
}

/* =========================================================
   INTELLIGENT PHOTO AUTO-LINKER & BATCH UPLOADER
   ========================================================= */

function normalizeMemberNameForMatching(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^(?:lt\.?\s*dr\.?|dr\.?|mr\.?|mrs\.?|ms\.?|miss|prof\.?|professor)\s+/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchPhotoToMember(filename, memberList) {
  if (!filename) return null;
  const raw = String(filename).replace(/\\/g, '/');
  const base = raw.split('/').pop().replace(/\.[^/.]+$/, '');
  
  // 1. Explicit ICMT ID in filename (e.g. ICMT107.jpg, ICMT-001.png, ICMT_045.jpeg)
  const icmtMatch = base.match(/ICMT[\-_]?(\d+)/i);
  if (icmtMatch) {
    const num = parseInt(icmtMatch[1], 10);
    const targetId = 'ICMT' + String(num).padStart(3, '0');
    const member = memberList.find(m => String(m.id).toUpperCase() === targetId);
    if (member) {
      return { member, reason: 'Member ID (' + targetId + ')', confidence: 1.0 };
    }
  }

  // 2. Extract name part from filename (stripping numeric prefixes like 001_, 123-, etc.)
  let cleanName = base
    .replace(/^(?:ICMT[\-_]?\d+|\d{1,4})[_\-\s]*/i, '')
    .replace(/[_\-]+/g, ' ')
    .trim();
  
  const normFile = normalizeMemberNameForMatching(cleanName);

  // 3. Name matching:
  if (normFile && normFile.length >= 3) {
    // Exact normalized name match
    let matched = memberList.find(m => normalizeMemberNameForMatching(m.name) === normFile);
    if (matched) {
      return { member: matched, reason: 'Faculty Name Match ("' + matched.name + '")', confidence: 0.98 };
    }

    // Substring / contained name match
    matched = memberList.find(m => {
      const mn = normalizeMemberNameForMatching(m.name);
      return mn && (mn === normFile || mn.includes(normFile) || normFile.includes(mn));
    });
    if (matched) {
      return { member: matched, reason: 'Faculty Name Match ("' + matched.name + '")', confidence: 0.90 };
    }

    // Multi-token overlap matching (at least 2 matching significant words)
    const fileTokens = normFile.split(' ').filter(t => t.length > 2);
    if (fileTokens.length >= 2) {
      let best = null;
      let maxOverlap = 0;
      memberList.forEach(m => {
        const mnTokens = new Set(normalizeMemberNameForMatching(m.name).split(' '));
        const overlap = fileTokens.filter(t => mnTokens.has(t)).length;
        if (overlap > maxOverlap && overlap >= Math.min(2, fileTokens.length)) {
          maxOverlap = overlap;
          best = m;
        }
      });
      if (best && maxOverlap >= 2) {
        return { member: best, reason: 'Key Name Tokens ("' + best.name + '")', confidence: 0.80 };
      }
    }
  }

  // 4. Fallback: Check if filename is purely numeric (e.g. 107.jpg, 001.png)
  const onlyNumMatch = base.match(/^(\d{1,4})$/);
  if (onlyNumMatch) {
    const num = parseInt(onlyNumMatch[1], 10);
    const targetId = 'ICMT' + String(num).padStart(3, '0');
    const member = memberList.find(m => String(m.id).toUpperCase() === targetId);
    if (member) {
      return { member, reason: 'Numeric ID fallback (' + targetId + ')', confidence: 0.70 };
    }
  }

  return null;
}

let photoSyncItems = [];

function openPhotoSyncDialog(){
  const modal = $("photoSyncModal");
  if(!modal) return;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  resetPhotoSyncState();
}

function closePhotoSyncDialog(){
  const modal = $("photoSyncModal");
  if(modal){
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
}

function resetPhotoSyncState(){
  photoSyncItems = [];
  const input = $("bulkPhotoInput");
  if(input) input.value = "";
  const countEl = $("bulkPhotoCount");
  if(countEl) countEl.textContent = "No files selected";
  ["photoSyncSummary", "photoSyncIssues", "photoSyncPreviewWrap", "photoSyncActions"].forEach(id => $(id)?.classList.add("hidden"));
  const btn = $("photoSyncCommitBtn");
  if(btn) btn.disabled = true;
}

function handleBulkPhotoSelect(input){
  const files = Array.from(input?.files || []);
  if(!files.length) return;
  
  const countEl = $("bulkPhotoCount");
  if(countEl) countEl.textContent = files.length + " file" + (files.length === 1 ? "" : "s") + " selected";
  photoSyncItems = [];

  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const match = matchPhotoToMember(file.name, members);
      photoSyncItems.push({
        filename: file.name,
        dataUrl: dataUrl,
        match: match,
        memberId: match ? match.member.id : null,
        memberName: match ? match.member.name : null,
        reason: match ? match.reason : "No match found",
        status: match ? (match.member.photo ? "replace" : "new") : "unmatched"
      });
      loaded++;
      if(loaded === files.length){
        renderPhotoSyncReview();
      }
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoSyncReview(){
  const matched = photoSyncItems.filter(x => x.memberId);
  const unmatched = photoSyncItems.filter(x => !x.memberId);
  const replaceCount = matched.filter(x => x.status === "replace").length;
  const newCount = matched.filter(x => x.status === "new").length;

  const summary = $("photoSyncSummary");
  if(summary){
    summary.classList.remove("hidden");
    summary.innerHTML =
      '<div class="import-stat"><div class="label">Total Photos</div><div class="value">' + photoSyncItems.length + '</div></div>' +
      '<div class="import-stat"><div class="label">Matched (New)</div><div class="value" style="color:#1d754e">' + newCount + '</div></div>' +
      '<div class="import-stat"><div class="label">Matched (Replace)</div><div class="value" style="color:#126b9b">' + replaceCount + '</div></div>' +
      '<div class="import-stat"><div class="label">Unmatched</div><div class="value" style="color:#9a3412">' + unmatched.length + '</div></div>';
  }

  const issues = $("photoSyncIssues");
  if(issues){
    if(unmatched.length){
      issues.classList.remove("hidden");
      issues.innerHTML = '<b>' + unmatched.length + ' photo' + (unmatched.length === 1 ? '' : 's') + ' could not be auto-matched:</b><ul>' +
        unmatched.map(x => '<li><b>' + esc(x.filename) + '</b> — rename with faculty name or Member ID (e.g. ICMT107.jpg) to match</li>').join("") +
        '</ul>';
    } else {
      issues.classList.add("hidden");
      issues.innerHTML = "";
    }
  }

  const wrap = $("photoSyncPreviewWrap");
  const body = $("photoSyncPreviewBody");
  if(wrap && body){
    wrap.classList.remove("hidden");
    body.innerHTML = photoSyncItems.map(item => {
      const thumb = '<img src="' + item.dataUrl + '" style="width:42px;height:42px;border-radius:6px;object-fit:cover;border:1px solid #d0d7de;vertical-align:middle" alt="preview">';
      const statusBadge = item.status === "new"
        ? '<span class="badge green">Ready to Link</span>'
        : item.status === "replace"
          ? '<span class="badge" style="background:#eaf5fb;color:#126b9b">Replace Existing</span>'
          : '<span class="badge" style="background:#fff7ed;color:#9a3412">Unmatched</span>';

      const memberInfo = item.memberId
        ? '<b>' + esc(item.memberId) + '</b> — ' + esc(item.memberName)
        : '<span style="color:var(--muted)">No member matched</span>';

      return '<tr>' +
        '<td>' + thumb + '</td>' +
        '<td><b>' + esc(item.filename) + '</b></td>' +
        '<td>' + memberInfo + '</td>' +
        '<td><span style="font-size:12px;color:var(--muted)">' + esc(item.reason) + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '</tr>';
    }).join("");
  }

  $("photoSyncActions")?.classList.remove("hidden");
  const btn = $("photoSyncCommitBtn");
  if(btn){
    btn.disabled = !matched.length;
    btn.textContent = matched.length ? "Apply " + matched.length + " Photo" + (matched.length === 1 ? "" : "s") : "Apply Photos";
  }
}

function commitPhotoSync(){
  const matched = photoSyncItems.filter(x => x.memberId);
  if(!matched.length){
    showToast("No matched photos to apply.");
    return;
  }

  let count = 0;
  matched.forEach(item => {
    const member = members.find(m => String(m.id).toUpperCase() === String(item.memberId).toUpperCase());
    if(member){
      member.photo = item.dataUrl;
      count++;
    }
  });

  persist();
  members = loadMembers();
  updateDashboard();
  renderDirectory();
  renderManagement();
  updateDataQuality();
  closePhotoSyncDialog();
  showToast("Successfully linked " + count + " photo" + (count === 1 ? "" : "s") + " to members.");
}

function exportUpdatedMemberDataJS(){
  const content = 'window.ICMT_MASTER_DATA = ' + JSON.stringify(members) + ';\n';
  const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'member-data.js';
  a.click();
  URL.revokeObjectURL(url);
  showToast("Downloaded updated member-data.js file.");
}

function renderManagement(){
  const body=$("managementBody");
  if(!body || typeof members==="undefined") return;
  updateDataQuality();

  const q=normalize($("managementSearch")?.value);
  const designation=$("managementDesignation")?.value||"";
  const statusFilter=$("managementStatusFilter")?.value||"";

  const list=members.filter(m=>{
    const searchable=[
      m.id,m.name,m.designation,m.college,m.department,
      m.city,m.state,m.country,m.qualification,m.professionalEmail,m.mobile,m.expertise
    ].filter(Boolean).join(" ").toLowerCase();

    let searchMatch=true;

    if(q){
      if(/^[a-z]$/i.test(q)){
        searchMatch=managementNormalizeName(m.name)===q.toUpperCase();
      }else{
        searchMatch=searchable.includes(q);
      }
    }

    const hasPhoto=Boolean(String(m.photo||"").trim());
    const isComplete=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ].every(v=>String(v??"").trim()!=="");

    let statusMatch=true;
    if(statusFilter==="missing-photos") statusMatch=!hasPhoto;
    else if(statusFilter==="with-photos") statusMatch=hasPhoto;
    else if(statusFilter==="missing-info") statusMatch=!isComplete;
    else if(statusFilter==="complete") statusMatch=isComplete;

    return searchMatch
      && (!designation || m.designation===designation)
      && statusMatch;
  });

  if(!list.length){
    body.innerHTML="";
    $("managementEmpty")?.classList.remove("hidden");
    return;
  }

  $("managementEmpty")?.classList.add("hidden");

  body.innerHTML=list.map(m=>{
    const photo=m.photo
      ? '<img class="thumb" src="'+m.photo+'" alt="Member photo">'
      : '<span class="thumb-placeholder">No photo</span>';

    const hasPhoto=Boolean(String(m.photo||"").trim());
    const isComplete=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ].every(v=>String(v??"").trim()!=="");

    const pending=String(m.status||"").toLowerCase()==="pending";
    const statusBadge = pending
      ? '<span class="badge" style="background:#fef3c7;color:#92400e">Pending Review</span>'
      : hasPhoto
        ? (isComplete ? '<span class="badge green">Complete</span>' : '<span class="badge" style="background:#eaf5fb;color:#126b9b">Missing Info</span>')
        : '<span class="badge" style="background:#fff7ed;color:#9a3412">No Photo</span>';

    return '<tr>'
      +'<td class="management-photo">'+photo+'</td>'
      +'<td class="management-id"><b>'+esc(m.id||"Not specified")+'</b></td>'
      +'<td><div class="management-name">'+esc(m.name||"Not specified")+'</div></td>'
      +'<td>'+esc(m.designation||"Not specified")+'</td>'
      +'<td>'+esc(m.college||"Not specified")+'</td>'
      +'<td class="management-qualification">'+esc(m.qualification||"Not specified")+'</td>'
      +'<td>'+statusBadge+'</td>'
      +'<td><div class="management-actions" style="display:flex;gap:4px;flex-wrap:wrap">'
      +'<button class="btn secondary" style="padding:4px 8px;font-size:12px" type="button" onclick="viewManagementMember(\''+esc(m.id)+'\')">View</button>'
      +'<button class="btn primary" style="padding:4px 8px;font-size:12px" type="button" onclick="editMember(\''+esc(m.id)+'\')">Edit</button>'
      +(pending ? '<button class="btn success" style="padding:4px 8px;font-size:12px" type="button" onclick="approveMember(\''+esc(m.id)+'\')">Approve</button>' : '')
      +'<button class="btn danger" style="padding:4px 8px;font-size:12px;background:#fef2f2;color:#dc2626;border-color:#fecaca" type="button" onclick="deleteMember(\''+esc(m.id)+'\')">Delete</button>'
      +'</div></td>'
      +'</tr>';
  }).join("");
}

function approveMember(id){
  const member=members.find(m=>String(m.id)===String(id));
  if(!member){ showToast("Member record not found."); return; }
  member.status="active";
  persist();
  renderManagement();
  updateDashboard();
  showToast("Member approved and published to the directory.");
}

function deleteMember(id){
  const member = members.find(m => String(m.id).toUpperCase() === String(id).toUpperCase());
  if(!member){
    showToast("Member record not found.");
    return;
  }
  const confirmed = confirm("Are you sure you want to permanently delete member " + member.id + " (" + member.name + ")?");
  if(!confirmed) return;

  members = members.filter(m => String(m.id).toUpperCase() !== String(id).toUpperCase());
  persist();
  members = loadMembers();
  updateDashboard();
  renderManagement();
  updateDataQuality();
  showToast("Member " + id + " deleted successfully.");
}

function editMember(id){
  const member=members.find(m=>String(m.id)===String(id));
  if(!member){
    showToast("Member record not found.");
    return;
  }

  editingMemberId=String(member.id);
  photoData=member.photo||"";
  showPage("add");

  const form=$("adminForm");
  if(!form) return;

  if(!form.dataset) form.dataset = {};
  form.dataset.editingId=member.id;
  const set=(name,value)=>{
    const field=form.elements[name];
    if(field) field.value=value||"";
  };

  set("title",member.title||"Dr.");
  set("name",member.name);
  set("qualification",member.qualification);
  set("designation",member.designation);
  set("department",member.department);
  set("college",member.college);
  set("collegeAddress",member.collegeAddress);
  set("pincode",member.pincode||member.collegePincode);
  set("permanentPincode",member.permanentPincode);
  set("state",member.state);
  set("country",member.country);
  set("guideship",member.guideship||member.researchSupervisor);
  set("expertise",Array.isArray(member.expertise)?member.expertise.join(", "):member.expertise);
  set("mobile",member.mobile);
  set("whatsapp",member.whatsapp);
  set("professionalEmail",member.professionalEmail);
  set("personalEmail",member.personalEmail);
  set("linkedin",member.linkedin);
  set("orcid",member.orcid);
  set("scholar",member.scholar);

  if(form.elements.name && !member.title){
    const match=String(member.name||"").match(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+(.*)$/i);
    if(match){
      form.elements.title.value=match[1];
      form.elements.name.value=match[2];
    }
  }

  const heading=$("addHeading");
  if(heading) heading.textContent="Edit Member — "+member.id;

  const save=$("adminSaveBtn");
  if(save){
    save.textContent="Update Member";
    save.type="submit";
  }

  const preview=$("adminPhoto");
  if(preview){
    preview.innerHTML=member.photo
      ? '<img src="'+member.photo+'" alt="Current member photo">'
      : "Photo preview";
  }
}

function resetAdminForm(){
  const form=$("adminForm");
  if(!form) return;
  form.reset();
  delete form.dataset.editingId;
  editingMemberId=null;
  photoData="";
  const heading=$("addHeading");
  if(heading) heading.textContent="Manual Member Entry";
  const save=$("adminSaveBtn");
  if(save){
    save.textContent="Save Member & Generate ID";
    save.type="submit";
  }
  const preview=$("adminPhoto");
  if(preview) preview.textContent="Photo preview";
}

function exportMembersCSV(){
  

  if(typeof members==="undefined") return;

  const headers=[
    "Member ID","Name","Qualification","Designation","Department",
    "Institution / Organization","City","State / Province","Country",
    "Research Guideship","Expertise","Mobile","WhatsApp",
    "Professional Email","Personal Email","LinkedIn","ORCID","Google Scholar"
  ];

  const escCSV=value=>{
    const text=Array.isArray(value)?value.join(", "):String(value??"");
    return '"'+text.replace(/"/g,'""')+'"';
  };

  const rows=members.map(m=>[
    m.id,m.name,m.qualification,m.designation,m.department,m.college,
    m.city,m.state,m.country,m.guideship||m.researchSupervisor,
    m.expertise,m.mobile,m.whatsapp,m.professionalEmail,m.personalEmail,
    m.linkedin,m.orcid,m.scholar
  ].map(escCSV).join(","));

  const blob=new Blob([[headers.map(escCSV).join(","),...rows].join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="ICMT_Faculty_Member_Data.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Member data exported as CSV.");
}

function loadXLSXForExport(callback){
  if(window.XLSX){ callback(); return; }

  const existing=document.querySelector('script[data-xlsx-export-loader]');
  if(existing){
    existing.addEventListener("load",callback,{once:true});
    existing.addEventListener("error",()=>exportMembersCSV(),{once:true});
    return;
  }

  const script=document.createElement("script");
  script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  script.dataset.xlsxExportLoader="true";
  script.onload=callback;
  script.onerror=()=>{
    showToast("Excel library could not be loaded. CSV export is available.");
    exportMembersCSV();
  };
  document.head.appendChild(script);
}

function exportMembersExcel(){
  if(typeof members==="undefined") return;

  loadXLSXForExport(()=>{
    if(!window.XLSX){
      exportMembersCSV();
      return;
    }

    const headers=[
      "Member ID","Name","Qualification","Designation","Department",
      "Institution / Organization","City","State / Province","Country",
      "Research Guideship","Expertise","Mobile","WhatsApp",
      "Professional Email","Personal Email","LinkedIn","ORCID","Google Scholar"
    ];

    const rows=members.map(m=>[
      m.id,m.name,m.qualification,m.designation,m.department,m.college,
      m.city,m.state,m.country,m.guideship||m.researchSupervisor,
      m.expertise,m.mobile,m.whatsapp,m.professionalEmail,m.personalEmail,
      m.linkedin,m.orcid,m.scholar
    ]);

    const worksheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
    const workbook=XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook,worksheet,"Faculty Data");

    // Improve readability in Excel.
    worksheet["!cols"]=headers.map((h,i)=>{
      const max=Math.max(
        h.length,
        ...rows.slice(0,100).map(row=>String(row[i]??"").length)
      );
      return {wch:Math.min(Math.max(max+2,12),40)};
    });

    XLSX.writeFile(workbook,"ICMT_Faculty_Member_Data.xlsx");
    showToast("Member data exported as Excel.");
  });
}

function $(id){ return document.getElementById(id); }

function esc(value){
  return String(value ?? "").replace(/[&<>"]/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
  }[c]));
}

function initials(name){
  return String(name||"").trim().split(/\s+/).filter(Boolean).slice(-2).map(x=>x[0]).join("").toUpperCase();
}

function normalize(value){
  return String(value||"").trim().toLowerCase();
}

function loadMembers(){
  try{
    const raw=localStorage.getItem(MEMBER_STORE_KEY);
    const parsed=raw ? JSON.parse(raw) : [];
    return dedupeMembers(Array.isArray(parsed)?parsed:[]);
  }catch(e){
    console.error(e);
    return [];
  }
}

function loadUsers(){
  try{
    const raw=localStorage.getItem(USER_STORE_KEY);
    const parsed=raw ? JSON.parse(raw) : null;
    if(Array.isArray(parsed)) return parsed;
  }catch(e){}
  return [
    {name:"Admin User",role:"Administrator",status:"Active",access:"Included"},
    {name:"Data Entry User 1",role:"Data Entry",status:"Active",access:"Included"},
    {name:"Data Entry User 2",role:"Data Entry",status:"Active",access:"Excluded"}
  ];
}

function dedupeMembers(list){
  const byId=new Set();
  const byKey=new Set();
  const result=[];
  const seenAlokKumar=false;
  let alokSeen=false;

  for(const m of list){
    const id=String(m.id||"").trim();
    const rawName=String(m.name||"").trim();
    const normalizedName=rawName
      .replace(/^(?:dr|mr|mrs|ms|miss|prof|professor)\\.?\\s+/i,"")
      .replace(/\\./g,"")
      .replace(/\\s+/g," ")
      .trim()
      .toLowerCase();

    // ICMT source data contains two records for Alok Kumar in older
    // localStorage versions. Keep the first valid record only.
    if(normalizedName==="alok kumar"){
      if(alokSeen) continue;
      alokSeen=true;
    }

    const key=[normalize(m.name),normalize(m.college),normalize(m.designation),normalize(m.state)].join("|");

    if(id){
      if(byId.has(id)) continue;
      byId.add(id);
    }

    if(byKey.has(key)) continue;
    byKey.add(key);
    result.push(m);
  }
  return result;
}

function persist(){
  members=dedupeMembers(members);
  localStorage.setItem(MEMBER_STORE_KEY,JSON.stringify(members));
  localStorage.setItem(USER_STORE_KEY,JSON.stringify(users));
  void syncMembersToApi();
}

function toast(message){
  const el=$("toast");
  if(!el) return;
  el.textContent=message;
  el.style.display="block";
  clearTimeout(el._timer);
  el._timer=setTimeout(()=>el.style.display="none",2800);
}
const showToast = toast;

function removeAdminSidebarButtons(){
  const dirBtn=document.querySelector('.nav button[data-page="directory"]');
  if(dirBtn) dirBtn.remove();
  const profileBtn=document.querySelector('.nav button[data-page="profile"]');
  if(profileBtn) profileBtn.remove();
}

async function login(){
  const email=String($("loginEmail")?.value||"").trim();
  const password=String($("loginPassword")?.value||"");
  if(!email || !password){
    alert("Enter your administrator email and password.");
    return;
  }
  try{
    const session=await apiRequest("/api/auth/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    });
    adminApiToken=session.token;
    sessionStorage.setItem(ADMIN_TOKEN_KEY,adminApiToken);
    const remoteMembers=await apiRequest("/api/admin/members");
    members=dedupeMembers(Array.isArray(remoteMembers)?remoteMembers:[]);
    localStorage.setItem(MEMBER_STORE_KEY,JSON.stringify(members));
  }catch(error){
    adminApiToken="";
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    alert(error.message||"Unable to sign in.");
    return;
  }
  removeAdminSidebarButtons();
  $("login").classList.add("hidden");
  $("public").classList.add("hidden");
  $("app").classList.remove("hidden");
  updateDashboard();
  renderUsers();
  showPage("dashboard");
}

function logout(){
  adminApiToken="";
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  $("app").classList.add("hidden");
  $("public").classList.add("hidden");
  $("login").classList.remove("hidden");
}

function openPublic(){
  $("login").classList.add("hidden");
  $("app").classList.add("hidden");
  $("public").classList.remove("hidden");
}

function backLogin(){
  $("public").classList.add("hidden");
  $("login").classList.remove("hidden");
}

const pageTitles={
  dashboard:"Dashboard",
  directory:"Faculty Directory",
  add:"Add Member (Manual)",
  profile:"Member Profile",
  users:"User Management"
};

function showPage(id,button){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const page=$(id);
  if(page) page.classList.add("active");
  if($("title")) $("title").textContent=pageTitles[id]||"ICMT Faculty Directory";
  document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active"));
  if(button) button.classList.add("active");
  if(id==="dashboard") updateDashboard();
  if(id==="directory") renderDirectory();
  if(id==="management") renderManagement();
  if(id==="users") renderUsers();
}

function nextId(){
  let max=0;
  for(const m of members){
    const n=parseInt(String(m.id||"").replace("ICMT",""),10);
    if(Number.isFinite(n)) max=Math.max(max,n);
  }
  return "ICMT"+String(max+1).padStart(3,"0");
}

function previewPhoto(input,targetId){
  const file=input?.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    photoData=reader.result;
    const target=$(targetId);
    if(target) target.innerHTML='<img src="'+reader.result+'" alt="Selected photo">';
  };
  reader.readAsDataURL(file);
}

function readForm(form){
  const data={};
  new FormData(form).forEach((v,k)=>{
    if(k!=="photo") data[k]=v;
  });
  return data;
}

function uniqueCheck(record,excludeId){
  const currentId=String(record.id||"").trim();
  const email=normalize(record.professionalEmail);
  const phone=String(record.mobile||"").replace(/\D/g,"");

  // Member IDs must be unique.
  if(currentId){
    const duplicateId=members.some(m=>
      String(m.id||"").trim().toUpperCase()===currentId.toUpperCase()
      && String(m.id||"")!==String(excludeId||"")
    );
    if(duplicateId){
      alert("This Member ID is already assigned to another member.");
      return false;
    }
  }

  // Professional email must be unique.
  if(email){
    const exists=members.some(m=>
      String(m.id||"")!==String(excludeId||"")
      && normalize(m.professionalEmail)===email
    );
    if(exists){
      alert("This professional email is already registered.");
      return false;
    }
  }

  // Mobile number must be unique.
  if(phone){
    const exists=members.some(m=>
      String(m.id||"")!==String(excludeId||"")
      && String(m.mobile||"").replace(/\D/g,"")===phone
    );
    if(exists){
      alert("This phone number is already registered.");
      return false;
    }
  }

  return true;
}


function validateMemberId(id,excludeId){
  const value=String(id||"").trim().toUpperCase();

  if(!/^ICMT\d{3,}$/.test(value)){
    alert("Invalid Member ID. Use the format ICMT001, ICMT002, ICMT003...");
    return false;
  }

  const duplicate=members.some(m=>
    String(m.id||"").trim().toUpperCase()===value
    && String(m.id||"")!==String(excludeId||"")
  );

  if(duplicate){
    alert("Member ID "+value+" already exists. Please use a unique ID.");
    return false;
  }

  return true;
}

function buildRecord(form,existing){
  const data=readForm(form);
  const name=String(data.name||"").trim();
  return {
    ...(existing||{}),
    ...data,
    id:String(existing?.id||nextId()).trim().toUpperCase(),
    name:((data.title||"")+" "+name).trim(),
    photo:photoData || existing?.photo || ""
  };
}

function resetEntryForm(){
  const form=$("adminForm");
  if(form) form.reset();
  photoData="";
  const preview=$("adminPhoto");
  if(preview) preview.innerHTML="Photo preview";
  const heading=$("addHeading");
  if(heading) heading.textContent="Manual Member Entry";
  const button=$("adminSaveBtn");
  if(button){
    button.textContent="Save Member & Generate ID";
    button.type="submit";
    button.onclick=null;
  }
  editingMemberId=null;
}

function handleAdminSubmit(event){
  event.preventDefault();
  if(saving) return;
  saving=true;

  try{
    const form=event.currentTarget;
    const existingId=editingMemberId;
    const existing=existingId ? members.find(m=>String(m.id)===String(existingId)) : null;

    if(existingId && !existing){
      alert("Member record not found.");
      return;
    }

    const record=buildRecord(form,existing);
    if(!normalize(record.name)){
      alert("Please enter the member name.");
      return;
    }

    if(!validateMemberId(record.id,existingId)) return;
    if(!uniqueCheck(record,existingId)) return;

    if(existingId){
      const idx=members.findIndex(m=>String(m.id)===String(existingId));
      members[idx]=record;
    }else{
      members.push(record);
    }

    persist();

    const saved=loadMembers().find(m=>String(m.id)===String(record.id));
    if(!saved) throw new Error("Could not verify saved record.");

    members=loadMembers();
    updateDashboard();
    renderDirectory();
    updateDataQuality();

    if(existingId){
      resetEntryForm();
      viewProfile(saved.id);
      toast("Member "+saved.id+" updated successfully.");
    }else{
      resetEntryForm();
      showPage("management");
      toast("Member saved successfully — "+saved.id);
    }
  }catch(e){
    console.error(e);
    alert("The member details could not be saved.");
  }finally{
    setTimeout(()=>saving=false,250);
  }
}

async function handlePublicSubmit(event){
  event.preventDefault();
  if(saving) return;
  saving=true;

  try{
    const form=event.currentTarget;
    const record=buildRecord(form,null);

    if(!normalize(record.name)){
      alert("Please enter the member name.");
      return;
    }

    const submission=await apiRequest("/api/member-submissions",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({member:record})
    });

    form.reset();
    photoData="";
    const preview=$("publicPhoto");
    if(preview) preview.innerHTML="Photo preview";

    alert("Registration submitted successfully for administrator review.\nReference ID: "+submission.id);
    backLogin();
  }catch(e){
    console.error(e);
    alert("The registration could not be saved.");
  }finally{
    setTimeout(()=>saving=false,250);
  }
}

function populateDirectoryGlobalFilters(){
  const stateSelect=$("filterState");
  const countrySelect=$("filterCountry");
  const currentState=stateSelect?.value||"";
  const currentCountry=countrySelect?.value||"";

  const states=[...new Set(
    members.map(m=>String(m.state||"").trim()).filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));

  const countries=[...new Set(
    members.map(m=>String(m.country||"").trim()).filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));

  if(stateSelect){
    stateSelect.innerHTML='<option value="">All States</option>'+
      states.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
    if(states.includes(currentState)) stateSelect.value=currentState;
  }

  if(countrySelect){
    countrySelect.innerHTML='<option value="">All Countries</option>'+
      countries.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
    if(countries.includes(currentCountry)) countrySelect.value=currentCountry;
  }
}

function renderDirectory(){
  // Alphabetical sorting:
  // 1. Remove titles such as Dr., Mr., Ms., Mrs., Prof., Lt. Dr.
  // 2. Find the FIRST actual alphabetic character.
  // 3. Sort by that starting letter.
  // 4. Within the same letter, sort by the complete normalized name.
  const normalizeNameForAZ = value => {
    let s=String(value||"").trim();

    const prefixes=[
      /^lt\.?\s*dr\.?\s+/i,
      /^dr\.?\s+/i,
      /^mr\.?\s+/i,
      /^mrs\.?\s+/i,
      /^ms\.?\s+/i,
      /^miss\s+/i,
      /^prof\.?\s+/i,
      /^professor\s+/i
    ];

    let changed=true;
    while(changed){
      changed=false;
      for(const prefix of prefixes){
        const next=s.replace(prefix,"").trim();
        if(next!==s){
          s=next;
          changed=true;
        }
      }
    }

    // Ignore periods and other punctuation completely for sorting.
    // Only the actual alphabetic characters determine the order.
    s=s.replace(/[.]/g,"").trim();

    const match=s.match(/[A-Za-z]/);
    const firstLetter=match ? match[0].toUpperCase() : "#";

    // Remove all non-alphabetic characters for the final comparison too.
    const fullName=s.replace(/[^A-Za-z0-9\s]/g,"")
                    .replace(/\s+/g," ")
                    .trim()
                    .toLocaleLowerCase();

    return {
      firstLetter,
      fullName
    };
  };

  const body=$("directoryBody");
  if(!body) return;

  populateDirectoryGlobalFilters();

  const q=normalize($("search")?.value);
  const state=$("filterState")?.value||"";
  const country=$("filterCountry")?.value||"";
  const designation=$("filterDes")?.value||"";
  const sort=$("sortBy")?.value||"name";

  // Search behavior:
  // If the user enters a single alphabetic letter (e.g. "K"),
  // show only members whose actual name starts with that letter.
  // Titles such as Dr., Mr., Ms., Mrs. and Prof. are ignored.
  const searchIsSingleLetter=/^[a-z]$/i.test(q);

  let list=members.filter(m=>{
    const searchable=[
      m.name,m.designation,m.department,m.college,m.city,m.state,m.country,m.expertise
    ].join(" ").toLowerCase();

    let searchMatch=true;

    if(q){
      if(searchIsSingleLetter){
        const normalized=normalizeNameForAZ(m.name);
        searchMatch=normalized.firstLetter===q.toUpperCase();
      }else{
        searchMatch=searchable.includes(q);
      }
    }

    return searchMatch
      && (!state||normalize(m.state)===normalize(state))
      && (!country||normalize(m.country)===normalize(country))
      && (!designation||normalize(m.designation)===normalize(designation));
  });

  list.sort((a,b)=>{
    if(sort==="name"){
      const A=normalizeNameForAZ(a.name);
      const B=normalizeNameForAZ(b.name);

      const letterCompare=A.firstLetter.localeCompare(B.firstLetter);
      if(letterCompare!==0) return letterCompare;

      return A.fullName.localeCompare(
        B.fullName,
        undefined,
        {numeric:true,sensitivity:"base"}
      );
    }

    if(sort==="id"){
      const ai=parseInt(String(a.id||"").replace(/\D/g,""),10);
      const bi=parseInt(String(b.id||"").replace(/\D/g,""),10);
      return (Number.isFinite(ai)?ai:Infinity)-(Number.isFinite(bi)?bi:Infinity);
    }

    if(sort==="designation"){
      return String(a.designation||"").localeCompare(
        String(b.designation||""),
        undefined,
        {sensitivity:"base"}
      );
    }

    if(sort==="state"){
      return String(a.state||"").localeCompare(
        String(b.state||""),
        undefined,
        {sensitivity:"base"}
      );
    }

    if(sort==="country"){
      return String(a.country||"").localeCompare(
        String(b.country||""),
        undefined,
        {sensitivity:"base"}
      );
    }

    return String(a.name||"").localeCompare(
      String(b.name||""),
      undefined,
      {sensitivity:"base"}
    );
  });

  if(!list.length){
    body.innerHTML="";
    $("empty")?.classList.remove("hidden");
    return;
  }

  $("empty")?.classList.add("hidden");

  body.innerHTML=list.map(m=>{
    const photo=m.photo
      ? '<img class="thumb" src="'+m.photo+'" alt="Member photo">'
      : '<span class="thumb-placeholder">No photo</span>';

    const memberId=esc(m.id);

    return '<tr>'
      +'<td class="cell-photo">'+photo+'</td>'
      +'<td class="cell-id"><b>'+memberId+'</b></td>'
      +'<td class="cell-member"><span class="avatar">'+esc(initials(m.name))+'</span><span>'+esc(m.name||"Not specified")+'</span></td>'
      +'<td class="cell-designation">'+esc(m.designation||"Not specified")+'</td>'
      +'<td class="cell-institution">'+esc(m.college||"Not specified")+'</td>'
      +'<td class="cell-city">'+esc(m.city||"Not specified")+'</td>'
      +'<td class="cell-state">'+esc(m.state||"Not specified")+'</td>'
      +'<td class="cell-action"><button class="btn secondary directory-view-btn" type="button" data-member-id="'+memberId+'">View</button></td>'
      +'</tr>';
  }).join("");
}

function viewProfileById(button){
  viewProfile(button.getAttribute("data-id"));
}

function viewProfile(id){
  const member=members.find(m=>String(m.id)===String(id));
  if(!member){
    showToast("Member record not found.");
    return;
  }

  // PUBLIC PROFILE:
  // Deliberately expose only directory-approved information.
  // Contact details, private address information and other administrative
  // fields remain available only to authorized management users.
  const expertise=Array.isArray(member.expertise)
    ? member.expertise
    : String(member.expertise||"").split(",").map(x=>x.trim()).filter(Boolean);

  const photo=member.photo
    ? '<img src="'+member.photo+'" alt="Member photo">'
    : '<span>No photo</span>';

  $("profileContent").innerHTML=
    '<div class="profile">'
    +'<div><div class="photo-large">'+photo+'</div></div>'
    +'<div>'
    +'<div class="info-grid">'
    +'<div class="info"><b>Name</b>'+esc(member.name||"Not specified")+'</div>'
    +'<div class="info"><b>Designation</b>'+esc(member.designation||"Not specified")+'</div>'
    +'<div class="info"><b>Qualification</b>'+esc(member.qualification||"Not specified")+'</div>'
    +'<div class="info"><b>Department</b>'+esc(member.department||"Not specified")+'</div>'
    +'<div class="info"><b>Institution / Organization</b>'+esc(member.college||"Not specified")+'</div>'
    +'<div class="info"><b>City</b>'+esc(member.city||"Not specified")+'</div>'
    +'<div class="info"><b>State / Province</b>'+esc(member.state||"Not specified")+'</div>'
    +'<div class="info"><b>Country</b>'+esc(member.country||"Not specified")+'</div>'
    +'</div>'
    +(expertise.length
      ? '<div style="margin-top:12px"><div class="label" style="margin-bottom:7px">Expertise</div><div class="chips">'
        +expertise.map(x=>'<span class="chip">'+esc(x)+'</span>').join("")
        +'</div></div>'
      : '')
    +'</div></div>'
    +'<div class="notice" style="margin-top:18px">Public profile view. Administrative contact and private member information is restricted.</div>';

  showPage("profile");
}

function chips(value){
  return String(value||"").split(",").map(x=>x.trim()).filter(Boolean)
    .map(x=>'<span class="chip">'+esc(x)+'</span>').join("");
}


function openDashboardMetric(type){
  let list=[];
  let title="";
  let subtitle="";

  if(type==="total"){
    list=[...members];
    title="All Members";
    subtitle=list.length+" member record"+(list.length===1?"":"s");
  }else if(type==="pending"){
    list=members.filter(m=>String(m.status||"").toLowerCase()==="pending"||m.isPending);
    title="Pending Members";
    subtitle=list.length+" pending registration"+(list.length===1?"":"s")+" found";
  }else if(type==="missing-photos"){
    list=members.filter(m=>!String(m.photo||"").trim());
    title="Members with Missing Photos";
    subtitle=list.length+" member"+(list.length===1?"":"s")+" without photograph";
  }else if(type==="incomplete"){
    list=members.filter(m=>{
      const required=[
        m.name,m.qualification,m.designation,m.department,
        m.college,m.state,m.country,m.expertise
      ];
      return !required.every(v=>String(v??"").trim()!=="");
    });
    title="Incomplete Member Profiles";
    subtitle=list.length+" member profile"+(list.length===1?"":"s")+" with missing information";
  }else if(type==="scholars"){
    list=members.filter(m=>normalize(m.designation)==="research scholar");
    title="Research Scholars";
    subtitle=list.length+" research scholar"+(list.length===1?"":"s")+" found";
  }else if(type==="ap"){
    list=members.filter(m=>normalize(m.state)==="andhra pradesh");
    title="Members from Andhra Pradesh";
    subtitle=list.length+" member"+(list.length===1?"":"s")+" found";
  }else if(type==="countries"){
    const countries=[...new Set(members.map(m=>String(m.country||"").trim()).filter(Boolean))];
    list=members.filter(m=>countries.includes(String(m.country||"").trim()));
    title="Members by Country";
    subtitle=countries.length+" countr"+(countries.length===1?"y":"ies")+" represented";
  }else{
    return;
  }

  const panel=$("dashboardMetricResults");
  const body=$("dashboardMetricBody");
  if(!panel||!body) return;

  $("dashboardMetricTitle").textContent=title;
  $("dashboardMetricSubtitle").textContent=subtitle;

  body.innerHTML=list.length
    ? list.map(m=>{
        const photo=m.photo
          ? '<img class="thumb" src="'+m.photo+'" alt="Member photo">'
          : '<span class="thumb-placeholder">No photo</span>';
        return '<tr>'
          +'<td class="cell-photo">'+photo+'</td>'
          +'<td><b>'+esc(m.id||"Not specified")+'</b></td>'
          +'<td><div class="management-name">'+esc(m.name||"Not specified")+'</div></td>'
          +'<td>'+esc(m.designation||"Not specified")+'</td>'
          +'<td>'+esc(m.department||"Not specified")+'</td>'
          +'<td>'+esc(m.college||"Not specified")+'</td>'
          +'<td>'+esc(m.state||"Not specified")+'</td>'
          +'<td><button class="btn secondary" type="button" onclick="viewProfile(\''+esc(m.id)+'\')">View</button></td>'
          +'</tr>';
      }).join("")
    : '<tr><td colspan="8" style="text-align:center;padding:25px">No matching members found.</td></tr>';

  panel.style.display="block";
  panel.scrollIntoView({behavior:"smooth",block:"start"});
}

function closeDashboardMetric(){
  const panel=$("dashboardMetricResults");
  if(panel) panel.style.display="none";
}

function updateDashboard(){
  const total=members.length;
  const pending=members.filter(m=>String(m.status||"").toLowerCase()==="pending"||m.isPending).length;
  const missingPhotos=members.filter(m=>!String(m.photo||"").trim()).length;
  const incomplete=members.filter(m=>{
    const required=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ];
    return !required.every(v=>String(v??"").trim()!=="");
  }).length;

  const scholars=members.filter(m=>normalize(m.designation)==="research scholar").length;
  const ap=members.filter(m=>normalize(m.state)==="andhra pradesh").length;
  const countries=new Set(members.map(m=>String(m.country||"").trim()).filter(Boolean)).size;

  if($("metricTotal")) $("metricTotal").textContent=total;
  if($("metricPending")) $("metricPending").textContent=pending;
  if($("metricMissingPhotos")) $("metricMissingPhotos").textContent=missingPhotos;
  if($("metricIncomplete")) $("metricIncomplete").textContent=incomplete;

  if($("metricScholars")) $("metricScholars").textContent=scholars;
  if($("metricAP")) $("metricAP").textContent=ap;
  if($("metricCountries")) $("metricCountries").textContent=countries;

  renderStats("stateStats",countBy("state"),showAllStateStats ? 0 : 5);
  renderStats("designationStats",countBy("designation"),showAllDesStats ? 0 : 5);
  renderCommaStats("expertiseStats",countMulti("expertise"),showAllExpertise ? 0 : 5);
  renderCommaStats("guideshipStats",countMulti("guideship"),showAllGuideship ? 0 : 5);
}

let showAllStateStats = false;
let showAllDesStats = false;
let showAllExpertise = false;
let showAllGuideship = false;

function toggleStateStatsView(){
  showAllStateStats = !showAllStateStats;
  const btn = $("stateStatsToggleBtn");
  const sub = $("stateStatsSubtitle");
  if(btn) btn.textContent = showAllStateStats ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllStateStats ? "(All States)" : "(Top 5)";
  renderStats("stateStats", countBy("state"), showAllStateStats ? 0 : 5);
}

function toggleDesStatsView(){
  showAllDesStats = !showAllDesStats;
  const btn = $("desStatsToggleBtn");
  const sub = $("desStatsSubtitle");
  if(btn) btn.textContent = showAllDesStats ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllDesStats ? "(All Designations)" : "(Top 5)";
  renderStats("designationStats", countBy("designation"), showAllDesStats ? 0 : 5);
}

function toggleExpertiseView(){
  showAllExpertise = !showAllExpertise;
  const btn = $("expertiseToggleBtn");
  const sub = $("expertiseSubtitle");
  if(btn) btn.textContent = showAllExpertise ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllExpertise ? "(All)" : "(Top 5)";
  renderCommaStats("expertiseStats", countMulti("expertise"), showAllExpertise ? 0 : 5);
}

function toggleGuideshipView(){
  showAllGuideship = !showAllGuideship;
  const btn = $("guideshipToggleBtn");
  const sub = $("guideshipSubtitle");
  if(btn) btn.textContent = showAllGuideship ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllGuideship ? "(All)" : "(Top 5)";
  renderCommaStats("guideshipStats", countMulti("guideship"), showAllGuideship ? 0 : 5);
}

function countBy(field){
  const counts={};
  if(field==="designation"){
    const categories=["Assistant Professor","Associate Professor","Professor","Dean","Research Scholar","Head of the Department","Principal","Director"];
    categories.forEach(c=>counts[c]=0);
    let matched=0;
    members.forEach(m=>{
      const v=normalize(m.designation);
      let c=null;
      if(v==="assistant professor") c="Assistant Professor";
      else if(v==="associate professor") c="Associate Professor";
      else if(v==="professor") c="Professor";
      else if(v==="dean") c="Dean";
      else if(v==="research scholar") c="Research Scholar";
      else if(v==="head of the department"||v==="head of department"||v==="hod"||v==="head of the department (hod)") c="Head of the Department";
      else if(v==="principal") c="Principal";
      else if(v==="director") c="Director";
      if(c){counts[c]++;matched++;}
    });
    counts["Not specified"]=members.length-matched;
    return counts;
  }
  members.forEach(m=>{
    const key=String(m[field]||"Not specified").trim()||"Not specified";
    counts[key]=(counts[key]||0)+1;
  });
  return counts;
}

function countMulti(field){
  const counts={};
  members.forEach(m=>{
    const values=String(m[field]||"").split(",").map(x=>x.trim()).filter(Boolean);
    if(!values.length){
      counts["Not specified"]=(counts["Not specified"]||0)+1;
      return;
    }
    values.forEach(value=>{
      counts[value]=(counts[value]||0)+1;
    });
  });
  return counts;
}

function renderStats(id,counts,limit=5){
  const el=$(id);
  if(!el) return;
  let entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){
    el.innerHTML='<div class="empty" style="padding:12px;font-size:12px">No member records yet.</div>';
    return;
  }
  const max=Math.max(...entries.map(x=>x[1]),1);
  if(limit > 0){
    entries = entries.slice(0, limit);
  }
  el.innerHTML=entries.map(([k,v])=>{
    const width=Math.max(8,Math.round(v/max*100));
    return '<div style="font-size:12px;margin-bottom:2px;display:flex;justify-content:space-between;color:var(--text)"><span>'+esc(k)+'</span><b>'+v+'</b></div><div class="bar" style="height:6px;margin:3px 0 9px"><span style="width:'+width+'%"></span></div>';
  }).join("");
}

function renderCommaStats(id,counts,limit=5){
  const el=$(id);
  if(!el) return;
  let entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){
    el.innerHTML='<div class="empty" style="padding:8px;font-size:12px">No records available.</div>';
    return;
  }
  if(limit > 0){
    entries = entries.slice(0, limit);
  }
  el.innerHTML='<div class="chips" style="gap:5px">'+entries.map(([k,v])=>
    '<span class="chip" style="font-size:11px;padding:3px 8px">'+esc(k)+' <b>· '+v+'</b></span>'
  ).join("")+'</div>';
}

function renderUsers(){
  const body=$("userBody");
  if(!body) return;
  body.innerHTML=users.map((u,i)=>
    '<tr><td>'+esc(u.name)+'</td><td>'+esc(u.role)+'</td>'
    +'<td><span class="badge '+(u.status==="Active"?"green":"red")+'">'+esc(u.status)+'</span></td>'
    +'<td><button class="btn '+(u.access==="Included"?"success":"danger")+'" type="button" onclick="toggleAccess('+i+')">'+esc(u.access)+'</button></td>'
    +'<td><button class="btn secondary" type="button" onclick="toggleStatus('+i+')">Toggle Status</button></td></tr>'
  ).join("");
}

function toggleAccess(index){
  users[index].access=users[index].access==="Included"?"Excluded":"Included";
  persist();
  renderUsers();
}

function toggleStatus(index){
  users[index].status=users[index].status==="Active"?"Inactive":"Active";
  persist();
  renderUsers();
}

function resetEntryMode(){
  editingMemberId=null;
  photoData="";
  const form=$("adminForm");
  if(form) form.reset();
}

document.addEventListener("click",function(event){
  const button=event.target.closest(".directory-view-btn");
  if(!button) return;
  const id=button.getAttribute("data-member-id");
  if(id) viewProfile(id);
});

document.addEventListener("DOMContentLoaded",()=>{
  const publicForm=$("publicForm");
  if(publicForm) publicForm.addEventListener("submit",handlePublicSubmit);

  const adminForm=$("adminForm");
  if(adminForm) adminForm.addEventListener("submit",handleAdminSubmit);

  $("loginBtn")?.addEventListener("click",login);
  $("openPublicBtn")?.addEventListener("click",openPublic);
  $("backLoginBtn")?.addEventListener("click",backLogin);
  $("logoutBtn")?.addEventListener("click",logout);

  $("publicPhotoInput")?.addEventListener("change",e=>previewPhoto(e.target,"publicPhoto"));
  $("adminPhotoInput")?.addEventListener("change",e=>previewPhoto(e.target,"adminPhoto"));

  $("search")?.addEventListener("input",renderDirectory);
  $("filterState")?.addEventListener("change",renderDirectory);
  $("filterDes")?.addEventListener("change",renderDirectory);
  $("sortBy")?.addEventListener("change",renderDirectory);

  removeAdminSidebarButtons();
  document.querySelectorAll(".nav button").forEach(button=>{
    button.addEventListener("click",()=>showPage(button.dataset.page,button));
  });

  updateDashboard();
  renderUsers();
});

if(typeof document!=="undefined" && document.readyState!=="loading"){
  removeAdminSidebarButtons();
}

document.addEventListener("DOMContentLoaded", function(){
  removeAdminSidebarButtons();
  try{
    const saved=localStorage.getItem("icmtPrototypeRole");
    if(["public","member","admin"].includes(saved)){
      prototypeRole=saved;
      const select=$("prototypeRole");
      if(select) select.value=saved;
    }
  }catch(e){}
  applyRoleAccess();
});
