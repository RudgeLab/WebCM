(async () => {
	const editorDiv = document.getElementById("editor-container");
	const editor = monaco.editor.create(editorDiv, {
		value: "",
		language: "python",
		readOnly: false,
		automaticLayout: true,
	});

	const editorToolbar = document.getElementById("editor-toolbar");
	editorToolbar.addEventListener("keydown", function(e) {
		if (e.ctrlKey && e.key === "s") {
			e.preventDefault();
			e.stopPropagation();

			saveSource();
		}
	}, true);

	const csrfToken = document.querySelector("input[name='csrfmiddlewaretoken']");
	const uuid = param__sourceUUID;

	const sourceUpload = document.getElementById("source-upload-file");
	const sourceState = document.getElementById("source-state");

	function saveSource() {
		fetch(`/api/setsrccontent?uuid=${uuid}`, {
			method: "POST",
			headers: {
				"Accept": "text/plain",
				"Content-Type": "text/plain",
				"X-CSRFToken": csrfToken.value,
			},
			mode: "same-origin",
			body: JSON.stringify({ "uuid": uuid, "source": editor.getValue() }),
		});

		sourceState.innerText = "Saved";
	}

	function unsaveSource() {
		sourceState.innerText = "Unsaved";
	}

	function doFileUpload() {
		this.files[0].slice().text().then((content) => editor.setValue(content));
	}

	sourceUpload.addEventListener("change", doFileUpload, false);

	const sourceResponse = await fetch(`/api/getsrccontent?uuid=${uuid}`);
	if (!sourceResponse.ok) { throw new Error(`Request error: ${sourceResponse.status}`); }
	
	const sourceBody = await sourceResponse.text();
	editor.setValue(sourceBody);

	editor.onDidChangeModelContent(e => unsaveSource());
	editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveSource());

	let tempButton = null;
	if (tempButton = document.getElementById("upload-file-btn")) tempButton.onclick = (e) => { sourceUpload.click(); };
	if (tempButton = document.getElementById("save-source-btn")) tempButton.onclick = (e) => saveSource();
})();