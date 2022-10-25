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
    const checkoutRepo = document.getElementById("input-custom-checkout");
    const sourceUpload = document.getElementById("input-upload-file");
    
    const customGitUrl = document.getElementById("input-backend-git-repo");
    const customBranch = document.getElementById("input-backend-git-branch");

    if (!isVersionCM4.checked && !isVersionCM5.checked) {
        alert("Hmmm... neither CM4 nor CM5 is selected. This shouldn't happen!");
        return;
    }

    let invalid = false;
    invalid |= markAsError("input-create-name", simName.value == "");
    invalid |= markAsError("upload-button-text", sourceUpload.files.length == 0);

    if (checkoutRepo.checked) {
        invalid |= markAsError("input-backend-git-repo", customGitUrl.value == "");
        invalid |= markAsError("input-backend-git-branch", customBranch.value == "");
    }

    if (invalid) return;

    const name = simName.value;
    const version = isVersionCM5.checked ? "CellModeller5" : "CellModeller4";
    const source = await sourceUpload.files[0].slice().text();

    let backend = version;

    if (checkoutRepo.checked) {
        backend = {
            "version": version,
            "url": customGitUrl.value,
            "branch": customBranch.value,
        };
    }

    fetch("/api/simrunner/createnewsimulation", {
        method: "POST",
        headers: {
            "Accept": "text/plain",
            "Content-Type": "text/plain",
        },
        body: JSON.stringify({
            "name": name,
            "source": source,
            "backend": backend,
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
});