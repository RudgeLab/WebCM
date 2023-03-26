var global__dialogDeletePros = null;

function openDialog(message) {
	document.getElementById("dialog-layer").style = "";
	document.getElementById("dialog-message").innerText = message;
}

function closeDialog() {
	document.getElementById("dialog-layer").style = "display: none";
	document.getElementById("dialog-message").innerText = "";
}

function showAlert(message) {
	global__dialogDeletePros = { "noaction": true };

	openDialog(message);
}

function handleDeleteSimulation(title, uuid) {
	global__dialogDeletePros = { "uuid": uuid, "simulation": true, "noaction": false };

	openDialog(decodeURIComponent(title));
}

function handleDeleteSourceContent(title, uuid) {
	global__dialogDeletePros = { "uuid": uuid, "simulation": false, "noaction": false };

	openDialog(title);
}

async function handleAcceptDelete(button) {
	closeDialog();

	if (global__dialogDeletePros == null) return;
	if (global__dialogDeletePros["noaction"]) return;

	const csrfToken = document.querySelector("input[name='csrfmiddlewaretoken']");
	const uuid = global__dialogDeletePros["uuid"];
	const isSimulation = global__dialogDeletePros["simulation"];

	const deleteURL = isSimulation ?
		`/api/deletesimulation?uuid=${uuid}` :
		`/api/deletesourcefile?uuid=${uuid}`;

	await fetch(deleteURL, {
		method: "GET",
		headers: {
			"Accept": "text/plain",
			"Content-Type": "text/plain",
			"X-CSRFToken": csrfToken.value,
		}
	});

	if (isSimulation) await refreshSimList();
	else await refreshSourceList();
}

function setupTabs() {
	const tabContainers = document.getElementById("tab-container");
	const allTabs = tabContainers.querySelectorAll(".tab-item");

	const tabWindow = document.getElementById("tab-window");
	const allFrames = tabWindow.querySelectorAll(".tab-frame");

	const activateTab = (index) => {
		for (const otherTab of allTabs) otherTab.classList.add("hidden-tab");
		for (const otherFrame of allFrames) otherFrame.classList.add("inactive-frame");

		allTabs[index].classList.remove("hidden-tab");
		allFrames[index].classList.remove("inactive-frame");
	};

	for (let i = 0; i < allTabs.length; i++) {
		allTabs[i].onclick = (e) => activateTab(i);
	}

	activateTab(0);
}

function markAsError(elemId, isError) {
	const elem = document.getElementById(elemId);
	
	if (isError) elem.classList.add("incorrect-field");
	else elem.classList.remove("incorrect-field");

	return isError;
}

async function submitCreateSimulationRequest() {
	async function _create(name, source, version) {
		const response = await fetch("/api/createnewsimulation", {
			method: "POST",
			headers: {
				"Accept": "text/plain",
				"Content-Type": "text/plain",
				"X-CSRFToken": csrfToken.value,
			},
			body: JSON.stringify({
				"name": name,
				"source": source,
				"backend": version
			})
		});
	
		if (!response.ok) {
			showAlert(await response.text());
			return;
		}

		const simUUID = await response.text();
	
		window.location.href = `/view/${simUUID}/`;
	}

	const simName = document.getElementById("input-create-name");
	const sourceFileSelect = document.getElementById("select-simulation-src-file");

	const radioBtnCM5 = document.getElementById("input-radio-cm5")
	const version = (radioBtnCM5 && radioBtnCM5.checked) ? "CellModeller5" : "CellModeller4";

	const name = simName.value;
	const csrfToken = document.querySelector("input[name='csrfmiddlewaretoken']");

	if (sourceFileSelect.value != "") {
		const sourceResponse = await fetch(`/api/getsrccontent?uuid=${sourceFileSelect.value}`);
		if (!sourceResponse.ok) { throw new Error(`Request error: ${sourceResponse.status}`); }
		
		const source = await sourceResponse.text();
		await _create(name, source, version);
	} else {
		const sourceUpload = document.getElementById("input-upload-file");

		sourceUpload.onchange = (event) => {
			event.target.files[0].slice().text().then((content) => _create(name, content, version));
		};
		sourceUpload.click();
	}
}

async function submitCreateSourceRequest() {
	const srcName = document.getElementById("input-create-source");
	const name = encodeURIComponent(srcName.value)

	const csrfToken = document.querySelector("input[name='csrfmiddlewaretoken']");

	const response = await fetch(`/api/createsourcefile?name=${name}`, {
		method: "GET",
		headers: {
			"Accept": "text/plain",
			"Content-Type": "text/plain",
			"X-CSRFToken": csrfToken.value,
		}
	});

	if (!response.ok) {
		showAlert(await response.text());
		return;
	}

	const uuid = await response.text();
	window.location.href = `/edit/${uuid}/`;
}

async function refreshSimList() {
	const simListResponse = await fetch(`/api/listsimulations`);
	const simList = await simListResponse.json();

	const simItemContainer = document.getElementById("select-sim-item-container");
	simItemContainer.innerHTML = "";

	if (simList.length == 0) {
		simItemContainer.innerHTML = `<div class="center-content"><p class="content-list-empty-text">No simulations</p></div>`;
		return;
	}

	for (let sim of simList) {
		const statusText = sim.isOnline ? "Online" : "Offline";

		const item = document.createElement("div");
		item.innerHTML = 
`<div class="select-sim-item">
	<div class="select-sim-labels">
		<p>${sim.title}</p>
		<p>${statusText}</p>
	</div>
	<div class="select-sim-buttons">
		<a class="select-sim-button sim-button-other"><span class="shape-cross"></span></a>
		<a class="select-sim-button sim-button-view" href="/view/${sim.uuid}/"><span class="shape-right-arrow"></span></a>
	</div>
</div>`;

		item.querySelector("a.sim-button-other").onclick = e => handleDeleteSimulation(`Delete simulation '${sim.title}'?`, sim.uuid);

		simItemContainer.appendChild(item.firstChild);
	}
}

async function refreshSourceList() {
	const srcListResponse = await fetch(`/api/listsourcefiles`);
	const srcList = await srcListResponse.json();

	const srcItemContainer = document.getElementById("select-src-item-container");
	srcItemContainer.innerHTML = "";
	
	if (srcList.length == 0) {
		srcItemContainer.innerHTML = `<div class="center-content"><p class="content-list-empty-text">No Source File</p></div>`;
		return;
	}

	for (let src of srcList) {
		const item = document.createElement("div");
		item.innerHTML = 
`<div class="select-sim-item">
	<div class="select-sim-labels" style="height: unset;">
		<p style="display:flex;align-items:center;height:100%;">${src.title}</p>
	</div>
	<div class="select-sim-buttons">
		<a class="select-sim-button sim-button-other"><span class="shape-cross"></span></a>
		<a class="select-sim-button sim-button-view" href="/edit/${src.uuid}/"><span class="shape-right-arrow"></span></a>
	</div>
</div>`;

		item.querySelector("a.sim-button-other").onclick = e => handleDeleteSourceContent(`Delete simulation '${src.title}'?`, src.uuid);

		srcItemContainer.appendChild(item.firstChild);
	}

	const sourceFileSelect = document.getElementById("select-simulation-src-file");
	sourceFileSelect.innerHTML = `<option value="">&ltUpload File&gt</option>`;

	for (let src of srcList) {
		const item = document.createElement("div");
		item.innerHTML = `<option value="${src.uuid}"></option>`;
		item.firstChild.innerText = src.title;

		sourceFileSelect.appendChild(item.firstChild);
	}
}

window.addEventListener("load", (event) => {
	setupTabs();

	const createButton = document.getElementById("create-button");
	createButton.onclick = (e) => submitCreateSimulationRequest();

	const createSourceButton = document.getElementById("create-source-button");
	createSourceButton.onclick = (e) => submitCreateSourceRequest();

	refreshSimList();
	refreshSourceList();
});

window.addEventListener("pageshow", (event) => {
	//There is a big in Google Chrome where the requests sent by the following methods
	//never get retrieved. This only happens here, in the pageshow event. Adding a delay
	//seems to fix the problem.
	setTimeout(async () => {
		await refreshSimList();
		await refreshSourceList();
	}, 100);
});