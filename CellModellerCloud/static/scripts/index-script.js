var global__dialogDeleteUUID = null;

function showDialog(visible, message) {
	const dialogLayer = document.getElementById("dialog-layer");
	const dialogMessage = document.getElementById("dialog-message");

	dialogLayer.style = visible ? "" : "display: none;";
	dialogMessage.innerText = message;
}

function openDialog(message) {
	showDialog(true, message);
}

function closeDialog() {
	showDialog(false, "");
}

function handleRequestDelete(name, uuid) {
	openDialog(`Delete simulation "${name}"?`);
	
	global__dialogDeleteUUID = uuid;
}

async function handleAcceptDelete(button) {
	closeDialog();

	const csrfToken = document.querySelector("#create-form input[name='csrfmiddlewaretoken']");
	const uuid = global__dialogDeleteUUID;

	await fetch(`/api/simrunner/deletesimulation?uuid=${uuid}`, {
		method: "GET",
		headers: {
			"Accept": "text/plain",
			"Content-Type": "text/plain",
			"X-CSRFToken": csrfToken.value,
		}
	});

	await refreshSimList();
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
}

function markAsError(elemId, isError) {
	const elem = document.getElementById(elemId);
	
	if (isError) elem.classList.add("incorrect-field");
	else elem.classList.remove("incorrect-field");

	return isError;
}

async function submitCreateRequest() {
	const simName = document.getElementById("input-create-name");
	const isVersionCM4 = document.getElementById("input-radio-cm4");
	const isVersionCM5 = document.getElementById("input-radio-cm5");
	const sourceUpload = document.getElementById("input-upload-file");

	if (!isVersionCM4.checked && !isVersionCM5.checked) {
		alert("Hmmm... neither CM4 nor CM5 is selected. This shouldn't happen!");
		return;
	}

	let invalid = false;
	invalid |= markAsError("input-create-name", simName.value == "");
	invalid |= markAsError("upload-button-text", sourceUpload.files.length == 0);

	if (invalid) return;

	const name = simName.value;
	const version = isVersionCM5.checked ? "CellModeller5" : "CellModeller4";
	const source = await sourceUpload.files[0].slice().text();

	const csrfToken = document.querySelector("#create-form input[name='csrfmiddlewaretoken']");

	fetch("/api/simrunner/createnewsimulation", {
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
	})
	.then(async response => {
		if (!response.ok) throw new Error(await response.text());
		return response.text();
	})
	.then((uuid) => {
		window.location.href = `/view/${uuid}/`;
	})
	.catch((error) => {
		console.log(`Error when creating new simulation: ${error}`)
	});
}

async function refreshSimList() {
	const simListResponse = await fetch(`/api/listsimualtions/`);
	const simList = await simListResponse.json();

	const simItemContainer = document.getElementById("select-sim-item-container");
	simItemContainer.innerHTML = "";

	for (let sim of simList) {
		const statusText = sim.isOnline ? "Online" : "Offline";

		simItemContainer.innerHTML +=
`<div class="select-sim-item">
	<div class="select-sim-labels">
		<p>${sim.title}</p>
		<p>${statusText}</p>
	</div>
	<div class="select-sim-buttons">
		<a class="select-sim-button sim-button-other" onclick="handleRequestDelete('${sim.title}', '${sim.uuid}')"><span class="shape-cross"></span></a>
		<a class="select-sim-button sim-button-view" href="/view/${sim.uuid}/" target="_blank"><span class="shape-right-arrow"></span></a>
	</div>
</div>`;
	}
}

window.addEventListener("load", () => {
	setupTabs();

	const sourceUpload = document.getElementById("input-upload-file");
	const uploadName = document.getElementById("upload-file-name");

	sourceUpload.addEventListener("change", (e) => {
		const files = sourceUpload.files;
		if (files.length <= 0) return;

		uploadName.innerText = files[0].name;
	});

	const createButton = document.getElementById("create-button");
	createButton.onclick = (e) => submitCreateRequest();

	refreshSimList();
});