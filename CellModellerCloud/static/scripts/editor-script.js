(async () => {
	const editorDiv = document.getElementById("editor-container");
	const editor = monaco.editor.create(editorDiv, {
		value: "",
		language: "python",
		readOnly: false,
		automaticLayout: true,
	});

	const csrfToken = document.querySelector("input[name='csrfmiddlewaretoken']");
	const uuid = document.getElementById("uuid-field").value;

	const sourceUpload = document.getElementById("source-upload-file");
	const sourceState = document.getElementById("source-state");

	function saveSource() {
		fetch(`/api/saveviewer/setsimsource?uuid=${uuid}`, {
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

	const sourceResponse = await fetch(`/api/saveviewer/getsimsource?uuid=${uuid}`);
	const sourceBody = await sourceResponse.text();
	editor.setValue(sourceBody);

	editor.onDidChangeModelContent(e => unsaveSource());
	editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveSource());

	document.getElementById("upload-file-btn").onclick = (e) => { sourceUpload.click(); };
	document.getElementById("save-source-btn").onclick = (e) => saveSource();
})();