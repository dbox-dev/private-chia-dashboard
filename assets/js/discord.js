const { Webhook } = require('discord-webhook-node');

let discordHook;

function createDiscordWebhook(enabled, url) {
    if (enabled) {
        discordHook = new Webhook(url);
        discordHook.setUsername('Chia Monitor');
        discordHook.setAvatar('');
    } else {
        if (discordHook) {
            discordHook = null;
        }
    }
}

function discordSend(msg) {
    if (discordHook) {
        discordHook.send(msg)
            .catch(err => console.log(err.message));
    }
}