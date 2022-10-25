window.addEventListener("load", function(e) {
	document.getElementById("login-button").onclick = handleLogin;
});

function handleLogin(e) {
    e.preventDefault();

    const form = document.getElementById("login-form");
    const username = form.querySelector("#login-username");
    const password = form.querySelector("#login-password");
    const csrfToken = form.querySelector("input[name='csrfmiddlewaretoken']");
    const nextPage = form.querySelector("input[name='nextpage']");

    const postParams = `username=${encodeURIComponent(username.value)}&password=${encodeURIComponent(password.value)}`;

    fetch("/api/userauth/signin", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRFToken": csrfToken.value,
        },
        mode: "same-origin",
        body: postParams,
    })
    .then((response) => {
        if (!response.ok) throw new Error("Response error");

        let redirectTo = nextPage.value;
        if (redirectTo == "") redirectTo = "/";

        window.location.replace(redirectTo);
    })
    .catch((error) => {
        console.log("Fetch error: " + error);
    });
}