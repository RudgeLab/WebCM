(async () => {
	let editor = monaco.editor.create(document.getElementById("editor-container"), { value: "", language: "python" });

	const csrfToken = document.querySelector("input[name='csrfmiddlewaretoken']");

	const uuid = document.getElementById("uuid-field").value;
	const sourceResponse = await fetch(`/api/saveviewer/getsimsource?uuid=${uuid}`);
	const sourceBody = await sourceResponse.text();
	editor.setValue(sourceBody)

	editor.onDidChangeModelContent(e => {
		console.log("Set source")

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
	});
})();