const fs = require('fs');
const readYaml = require('read-yaml');
const writeYaml = require('write-yaml');
const Tail = require('tail-file');
const electron = require('electron');
const jsonfile = require('jsonfile');
const { exec } = require("child_process");
const Highcharts = require('highcharts');
const app = require('electron').remote.app;
const os = require("os");

const basepath = app.getAppPath();
const configFile = basepath + '\\config\\config.yaml';
const infoFile = basepath + '\\data\\info.json';
const lastAttemptedProofFile = basepath + '\\data\\last-attempted-proof.json';

let config = {};
let farmInfo = {};
let dps = [];
let dpst = [];

let dataLength = 20;

let mytail = null;

let hc;

function hcr(labels, datasets, datasetsTime) {
    hc = Highcharts.chart('chart-container', {
        chart: {
            type: 'spline',
            animation: true,
            zoomType: 'xy'
        },
        title: {
            text: 'Last Attempted Proof'
        },
        xAxis: {
            categories: labels,
            crosshair: true
        },
        yAxis: [
            {
                gridLineWidth: 0,
                title: {
                    text: 'Plot(s)',
                    style: {
                        color: '#15a362'
                    }
                },
                labels: {
                    formatter: function () {
                        return this.value;
                    }
                },
            },
            {
                title: {
                    text: 'Time',
                    style: {
                        color: '#fbbc04'
                    }
                },
                labels: {
                    formatter: function () {
                        return this.value;
                    }
                },
                opposite: true
            }
        ],
        tooltip: {
            shared: true
        },
        plotOptions: {
            spline: {
                dataLabels: {
                    enabled: false
                },
                enableMouseTracking: true
            }
        },
        legend: {
            layout: 'vertical',
            align: 'left',
            x: 80,
            verticalAlign: 'top',
            y: 55,
            floating: true,
            backgroundColor:
                Highcharts.defaultOptions.legend.backgroundColor || // theme
                'rgba(255,255,255,0.25)'
        },
        series: [{
            name: 'Attempted proof plot(s)',
            type: 'spline',
            yAxis: 1,
            data: datasets,
            color: '#15a362'
        }, {
            name: 'Proof time',
            type: 'spline',
            yAxis: 1,
            data: datasetsTime,
            color: '#fbbc04'
        }]
    });
}

function renderChart() {
    let labels = [];
    let datasets = [];
    let datasetsTime = [];
    for (let x in dps) {
        let obj = dps[x];
        let d = new Date(obj.x);
        let dstr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') +
            ':' + d.getSeconds().toString().padStart(2, '0');
        labels.push(dstr);
        datasets.push(obj.y);
    }
    for (let x in dpst) {
        let obj = dpst[x];
        datasetsTime.push(obj.y);
    }
    hcr(labels, datasets, datasetsTime);
}

function renderUpdateChart() {
    let labels = [];
    let datasets = [];
    let datasetsTime = [];
    for (let x in dps) {
        let obj = dps[x];
        let d = new Date(obj.x);
        let dstr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') +
            ':' + d.getSeconds().toString().padStart(2, '0');
        labels.push(dstr);
        datasets.push(obj.y);
    }
    for (let x in dpst) {
        let obj = dpst[x];
        datasetsTime.push(obj.y);
    }
    hc.xAxis[0].setCategories(labels);
    hc.series[0].setData(datasets, true);
    hc.series[1].setData(datasetsTime, true);
}

function notify(str) {
    if (config.enableLineNotification === 'Y' && config.lineToken !== undefined && config.lineToken !== null && config.lineToken !== '') {
        const net = electron.remote.net;
        const request = net.request({
            method: 'POST',
            protocol: 'https:',
            hostname: 'notify-api.line.me',
            path: '/api/notify',
            redirect: 'follow'
        });
        // request.on('response', (response) => {
        // console.log(`STATUS: ${response.statusCode}`);
        // console.log(`HEADERS: ${JSON.stringify(response.headers)}`);

        //     response.on('data', (chunk) => {
        //         console.log(`BODY: ${chunk}`)
        //     });
        // });
        // request.on('finish', () => {
        //     console.log('Request is Finished')
        // });
        request.on('abort', () => {
            console.log('Request is Aborted')
        });
        request.on('error', (error) => {
            console.log(`ERROR: ${JSON.stringify(error)}`)
        });
        // request.on('close', (error) => {
        //     console.log('Last Transaction has occured')
        // });
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        request.setHeader('Authorization', 'Bearer ' + config.lineToken);
        request.write('message=' + str, 'utf-8');
        request.end();
    }
    if (discordHook) {
        discordSend(str);
    }
}

function updateChart(d, p, t) {
    dps.push({
        x: d,
        y: p
    });
    dpst.push({
        x: d,
        y: t
    });
    if (dps.length > dataLength) {
        dps.shift();
    }
    if (dpst.length > dataLength) {
        dpst.shift();
    }
    saveLastAttemptedProof();
    doSend(JSON.stringify({
        type: 'current',
        data: {
            x: d,
            y: p,
            t: t
        }
    }));
    renderUpdateChart();
}

function addTodayProofPlot(p, d) {
    jsonfile.readFile(infoFile, function (err, obj) {
        if (!err) {
            const now = new Date();
            const n = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0');
            let todayProofPlots = 0;

            if (obj.todayProofPlot) {
                todayProofPlots = obj.todayProofPlot + p;
            } else {
                todayProofPlots = p;
            }
            if (n === obj.currentProofLog) {
                obj.todayProofPlot = todayProofPlots;
            } else {
                const ypp = obj.yesterdayProofPlot ? obj.yesterdayProofPlot : 0;
                if (ypp === 0) {
                    obj.yesterdayProofPlotPerformance = 100;
                } else {
                    const pfm = obj.todayProofPlot - ypp;
                    if (pfm === 0) {
                        obj.yesterdayProofPlotPerformance = 0;
                        obj.yesterdayProofPlotPerformanceStats = 'up';
                    } else if (pfm > 0) {
                        const npfm = pfm * 100 / ypp;
                        obj.yesterdayProofPlotPerformance = npfm.toFixed(2);
                        obj.yesterdayProofPlotPerformanceStats = 'up';
                    } else if (pfm < 0) {
                        const rpfm = ypp - obj.todayProofPlot;
                        const npfm = rpfm * 100 / ypp;
                        obj.yesterdayProofPlotPerformance = npfm.toFixed(2);
                        obj.yesterdayProofPlotPerformanceStats = 'down';
                    }
                }
                obj.yesterdayProofPlot = obj.todayProofPlot;
                obj.todayProofPlot = p;
                obj.currentProofLog = d;
            }
            saveInfo(obj);
            doSend(JSON.stringify({
                type: 'info',
                data: obj
            }));
        }
    });
}

function proofs(str) {
    if (str != null && str !== undefined && str !== '' && farmInfo.farmStatus === 'Farming') {
        const res = str.match(/([a-z0-9.]+)/mg);
        if (res != null) {
            const d = res[0] + '-' + res[1] + '-' + res[2] + ' ' + res[3] + ':' + res[4] + ':' + res[5];
            const dt = new Date(d);
            if (res[6] === "harvester") {
                if (res[7] === "chia.harvester.harvester") {
                    const p = parseFloat(res[8]);
                    const f = parseFloat(res[16]);
                    let msg = 'Last Attempted Proof use ' + res[8] + ' of ' + res[22] + ' plots. Found ' + res[16] + ' block(s). Time: ' + res[19] + ' s.';
                    const pt = parseFloat(res[19]);
                    updateChart(dt, parseFloat(res[8]), pt);
                    if (p > 0) {
                        addTodayProofPlot(p, res[0] + '-' + res[1] + '-' + res[2]);
                        logProof(res[0] + '-' + res[1] + '-' + res[2], res[3] + ':' + res[4] + ':' + res[5], p);
                        if (f > 0 && config.blockRewardNotification === 'Y') {
                            msg = 'Congratulations!!! you found ' + res[16] + ' block. At: ' + d + ' By ' + res[8] + '/' + res[22] + ' plots #' + res[14];
                            notify(msg);
                        }
                        if (config.lastAttemptedNotification === 'Y') {
                            notify(msg);
                        }
                        console.log(msg);
                    }
                } else if (res[7] === 'chia.plotting.plot') {
                    getFarmSummary(config.chiaFilePath);
                }
            }
        }
    }
}

function saveInfo(info) {
    jsonfile.writeFile(infoFile, info, function (err) {
        if (err) {
            console.error(err);
        } else {
            renderInfo(info);
        }
    });
}

function monitorLog() {
    if (farmInfo.farmStatus === 'Farming') {
        const logPath = config.mainnetLogPath?.replace('\\', '/');
        const logFile = logPath + "/debug.log";
        if (fs.existsSync(logFile)) {
            if (mytail) {
                mytail.stop();
            }
            mytail = new Tail(logPath + "/debug.log", line => {
                proofs(line);
            });
            mytail.on('error', err => console.error(err));
        } else {
            console.error('no file');
        }
    }
}

function saveConfig(cfg) {
    writeYaml(configFile, cfg, function (err) {

    });
}

function saveLastAttemptedProof() {
    let data = [];
    for (let i in dps) {
        data.push({
            x: dps[i].x,
            y: dps[i].y,
            t: dpst[i].y
        });
    }
    jsonfile.writeFile(lastAttemptedProofFile, data, function (err) {
        if (err) console.error(err)
    });
}

function initialChart() {
    jsonfile.readFile(lastAttemptedProofFile, function (err, obj) {
        if (!err) {
            for (let i in obj) {
                const o = obj[i];
                dps.push({
                    x: new Date(o.x),
                    y: o.y
                });
                if (dps.length > dataLength) {
                    dps.shift();
                }
            }
            for (let i in obj) {
                const o = obj[i];
                dpst.push({
                    x: new Date(o.x),
                    y: o.t
                });
                if (dpst.length > dataLength) {
                    dpst.shift();
                }
            }
            renderChart();
        } else {
            const now = new Date();
            const n = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0');

            updateChart(n, 0, 0);
        }
    })
}

function renderInfo(data) {
    document.getElementById('ele-farm-status').innerText = data.farmStatus;
    if (data?.farmStatus === 'Farming') {
        document.getElementById('ele-farm-status').classList.add('text-success');
    } else {
        document.getElementById('ele-farm-status').classList.remove('text-success');
    }
    document.getElementById('ele-total-chia-farmed').innerText = data?.totalChiaFarmed ? parseFloat(data.totalChiaFarmed) : 0;
    document.getElementById('ele-block-reward').innerText = data?.blockReward ? parseFloat(data.blockReward) : 0;
    document.getElementById('ele-total-plot').innerHTML = data.plotCount;
    document.getElementById('ele-total-size').innerHTML = data.totalPlotSize;
    document.getElementById('ele-total-size-unit').innerHTML = data.totalPlotSizeUnit;
    document.getElementById('ele-total-network-space').innerHTML = data.totalNetworkSize;
    document.getElementById('ele-total-network-space-unit').innerHTML = data.totalNetworkSizeUnit;
    document.getElementById('ele-today-proof-plot').innerHTML = data.todayProofPlot;
    document.getElementById('ele-estimated-time-to-win').innerHTML = data.timeToWin;
    document.getElementById('ele-yesterday-proof-plot').innerHTML = data.yesterdayProofPlot;
    document.getElementById('ele-yesterday-proof-plot-performance').innerHTML = data.yesterdayProofPlotPerformance;

    if (data.yesterdayProofPlotPerformanceStats === 'down') {
        document.getElementById('ele-yesterday-proof-plot-stats').classList.remove('text-success');
        document.getElementById('ele-yesterday-proof-plot-stats').classList.add('text-danger');
    } else {
        document.getElementById('ele-yesterday-proof-plot-stats').classList.remove('text-danger');
        document.getElementById('ele-yesterday-proof-plot-stats').classList.add('text-success');
    }
}

let refreshFarmStatusCoolDown;

function refreshFarmStatus(chiaFilePath) {
    console.log('refresh');
    if (chiaFilePath) {
        exec(chiaFilePath + ' show -s', (error, data, getter) => {
            if (data) {
                const res = data.match(/([a-zA-Z0-9.: ]+)/mg);
                jsonfile.readFile(infoFile, function (err, obj) {
                    if (!err) {
                        let farmSummary = obj;
                        if (res) {
                            for (let i in res) {
                                const l = res[i];
                                const ls = l.match(/([:]+)/mg);
                                if (l.startsWith('Current Blockchain Status')) {
                                    if (ls[0].trim().startsWith('Full Node syncing to block')) {
                                        farmSummary.farmStatus = Syncing;
                                        saveInfo(farmSummary);
                                        farmInfo = farmSummary;
                                        monitorLog();
                                        doSend(JSON.stringify({
                                            type: 'info',
                                            data: farmSummary
                                        }));
                                    }
                                }
                            }
                        }
                        clearInterval(refreshFarmStatusCoolDown);
                        if (farmSummary.farmStatus !== 'Farming') {
                            refreshFarmStatusCoolDown = setInterval(function () {
                                refreshFarmStatus(chiaFilePath);
                            }, 60000);
                        }
                    }
                });
            }
        });
    }
}

function getFarmSummary(chiaFilePath) {
    if (chiaFilePath) {
        exec(chiaFilePath + " farm summary", (error, data, getter) => {
            if (error) {
                console.log("error", error.message);
                return;
            }
            if (getter) {
                console.log("data", data);
                return;
            }
            const res = data.match(/([a-zA-Z0-9.: ]+)/mg);
            jsonfile.readFile(infoFile, function (err, obj) {
                if (!err) {
                    let farmSummary = obj;
                    if (res) {
                        for (let i in res) {
                            const l = res[i];
                            const ls = l.match(/([a-zA-Z0-9. ]+)/mg);
                            if (l.startsWith('Farming status')) {
                                farmSummary.farmStatus = ls[1].trim();
                                if (farmSummary.farmStatus !== 'Farming') {
                                    refreshFarmStatus(chiaFilePath);
                                }
                            }
                            if (l.startsWith('Plot count')) {
                                farmSummary.plotCount = ls[1].trim();
                            }
                            if (l.startsWith('Total size of plots')) {
                                const sv = ls[1].trim().split(' ');
                                farmSummary.totalPlotSize = sv[0];
                                farmSummary.totalPlotSizeUnit = sv[1];
                            }
                            if (l.startsWith('Estimated network space')) {
                                const sv = ls[1].trim().split(' ');
                                const s = parseFloat(sv[0]);
                                if (sv[1] === 'PiB' && s > 1024.0) {
                                    const sum = s / 1024;
                                    farmSummary.totalNetworkSize = sum.toFixed(3);
                                    farmSummary.totalNetworkSizeUnit = 'EiB';
                                } else {
                                    farmSummary.totalNetworkSize = sv[0];
                                    farmSummary.totalNetworkSizeUnit = sv[1];
                                }
                            }
                            if (l.startsWith('Expected time to win')) {
                                farmSummary.timeToWin = ls[1].trim();
                            }
                            if (l.startsWith('Block rewards')) {
                                farmSummary.blockReward = ls[1].trim();
                            }
                            if (l.startsWith('Total chia farmed')) {
                                farmSummary.totalChiaFarmed = ls[1].trim();
                            }
                        }
                    }
                    saveInfo(farmSummary);
                    farmInfo = farmSummary;
                    monitorLog();
                    doSend(JSON.stringify({
                        type: 'info',
                        data: farmSummary
                    }));
                }
            });
        });
    }
}
function renderSettings(data) {
    const accountName = os.userInfo().username;
    if (!data.mainnetLogPath) {
        const mainnetLogPath = 'C:\\Users\\'.concat(accountName).concat('\\.chia\\mainnet\\log');
        data.mainnetLogPath = mainnetLogPath;
        saveConfig(data);
    }
    document.getElementById('setting-chia-path').value = data.chiaFilePath;
    document.getElementById('setting-mainnet-log-path').value = data.mainnetLogPath;

    if (data.enableLineNotification === 'Y') {
        document.getElementById('setting-enable-line-notification').checked = true;
    } else {
        document.getElementById('setting-enable-line-notification').checked = false;
    }
    document.getElementById('setting-line-token').value = data.lineToken;
    if (data.blockRewardNotification === 'Y') {
        document.getElementById('setting-found-block-notification').checked = true;
    } else {
        document.getElementById('setting-found-block-notification').checked = false;
    }
    if (data.lastAttemptedNotification === 'Y') {
        document.getElementById('setting-last-attempted-notification').checked = true;
    } else {
        document.getElementById('setting-last-attempted-notification').checked = false;
    }

    if (data.enableServer === 'Y') {
        document.getElementById('setting-enable-server').checked = true;
    } else {
        document.getElementById('setting-enable-server').checked = false;
    }
    document.getElementById('setting-server-url').value = data.serverUrl;

    if (data.discordWebhookEnabled === 'Y') {
        document.getElementById('setting-enable-discord-notification').checked = true;
    } else {
        document.getElementById('setting-enable-discord-notification').checked = false;
    }
    document.getElementById('setting-discord-webhook-url').value = data.discordWebhookUrl;
}

function checkLogLevel() {
    const accountName = os.userInfo().username;
    const mainnetPath = 'C:\\Users\\'.concat(accountName).concat('\\.chia\\mainnet');
    const chiaConfigFile = mainnetPath.concat('\\config\\config.yaml');
    readYaml(chiaConfigFile, function (err, data) {
        if (!err && data) {
            const logLevel = data.farmer.logging.log_level;
            document.getElementById('setting-chia-log-level').innerText = logLevel;
            if (logLevel !== 'INFO') {
                document.getElementById('setting-change-log-level-btn').disabled = false;
            } else {
                document.getElementById('setting-change-log-level-btn').disabled = true;
            }
        }
    });
}

function initial() {
    try {
        readYaml(configFile, function (err, data) {
            if (err) throw err;
            config = data;
            const accountName = os.userInfo().username;
            const blockchainPath = 'C:\\Users\\'.concat(accountName).concat('\\AppData\\Local\\chia-blockchain');
            let currentChia = blockchainPath;
            fs.readdir(blockchainPath, (err, dir) => {
                if (!err) {
                    for (let filePath of dir) {
                        if (filePath.startsWith('app-')) {
                            currentChia = currentChia.concat('\\').concat(filePath).concat('\\resources\\app.asar.unpacked\\daemon\\chia.exe');
                            if (currentChia !== data.chiaFilePath) {
                                data.chiaFilePath = currentChia;
                                saveConfig(data);
                                renderSettings(data);
                                getFarmSummary(data.chiaFilePath);
                            }
                        }
                    }
                }
            });
            checkLogLevel();
            renderSettings(data);

            getFarmSummary(data.chiaFilePath);
            createWebSocket((data.enableServer === 'Y' ? true : false), data.serverUrl);
            createDiscordWebhook((data.discordWebhookEnabled === 'Y' ? true : false), data.discordWebhookUrl);
            // notify('Welcome to Chia Monitor version ' + config.version);
        });
        readYaml(infoFile, function (err, data) {
            if (err) throw err;
            renderInfo(data);
        });
    } catch (e) {
        console.error(e);
    }
}

let noMainnetLogDlg = new bootstrap.Modal(document.getElementById('no-mainnet-log-dlg'), {
    keyboard: false
});

let dlgConfirmChangeLogLevel = new bootstrap.Modal(document.getElementById('dlg-confirm-change-log-level'), {
    keyboard: false
});

let dlgConfirmRestartChia = new bootstrap.Modal(document.getElementById('dlg-confirm-restart-chia'), {
    keyboard: false
});

document.getElementById('setting-left').addEventListener('click', function () {
    document.getElementById('nav-setting-tab').click();
});

document.getElementById('setting-top').addEventListener('click', function () {
    document.getElementById('nav-setting-tab').click();
});

document.getElementById('overview-menu').addEventListener('click', function () {
    document.getElementById('nav-overview-tab').click();
});

document.getElementById('setting-change-log-level-btn').addEventListener('click', function () {
    this.disabled = true;
    dlgConfirmChangeLogLevel.show();
});

document.getElementById('setting-cancel-change-log-level').addEventListener('click', function () {
    checkLogLevel();
});

document.getElementById('setting-change-log-level').addEventListener('click', function () {
    console.log('confirm change log');
    exec(config.chiaFilePath + " configure -log-level INFO", (error, data, getter) => {
        if (data && data.toString().includes('Logging level updated')) {
            dlgConfirmRestartChia.show();
        } else {
            checkLogLevel();
        }
    });
});

document.getElementById('setting-restart-chia').addEventListener('click', function () {
    console.log('restart');
    exec(config.chiaFilePath + " stop all", (errorStop, dataStop, getterStop) => {
        if (dataStop) {
            exec(config.chiaFilePath + " start all", (errorStart, dataStart, getterStart) => {
                if (dataStart) {
                    initial();
                }
                checkLogLevel();
            });
        } else {
            checkLogLevel();
        }
    });
});

document.getElementById('setting-restart-chia-later').addEventListener('click', function () {
    checkLogLevel();
});

document.getElementById('setting-browse-chia-path').addEventListener('click', function (e) {
    document.getElementById('setting-chia-path-file-input').click();
});

document.getElementById('setting-chia-path-file-input').addEventListener('change', function (e) {
    let files = e.target.files;
    if (files !== null && files !== undefined && files.length > 0) {
        const file = files[0];
        if (file && file.path) {
            const path = file.path;
            document.getElementById('setting-chia-path').value = path;
        }
    }
});

document.getElementById('setting-browse-mainnet-log-path').addEventListener('click', function (event) {
    document.getElementById("setting-mainnet-log-path-file-input").click();
});

document.getElementById("setting-mainnet-log-path-file-input").addEventListener("change", function (event) {
    let files = event.target.files;
    if (files !== null && files !== undefined && files.length > 0) {
        let path = '';
        let s = files[0].path.split('\\');
        for (let i = 0; i < s.length - 1; i++) {
            const v = s[i];
            if (path !== '') {
                path = path.concat('\\').concat(v);
            } else {
                path = v;
            }
        }
        if (!fs.existsSync(path + '\\debug.log')) {
            noMainnetLogDlg.show();
        } else {
            document.getElementById('setting-mainnet-log-path').value = path;
        }
    }
    this.value = '';
}, false);

document.getElementById('setting-save-general').addEventListener('click', function () {
    const chiaFilePath = document.getElementById('setting-chia-path').value;
    const mainnetLogPath = document.getElementById('setting-mainnet-log-path').value;
    readYaml(configFile, function (err, data) {
        if (err) throw err;
        data.chiaFilePath = chiaFilePath;
        data.mainnetLogPath = mainnetLogPath;
        writeYaml(configFile, data, function (err) {
            if (!err) {
                config = data;
                monitorLog();
                const ele = document.getElementById('setting-save-general-message');
                ele.innerText = 'Save successfully.';
                ele.classList.add('save-alert', 'alert', 'alert-success');
                setTimeout(function () {
                    ele.innerText = '';
                    ele.classList.remove('save-alert', 'alert', 'alert-success');
                }, 3000);
            }
        });
    });
});
document.getElementById('setting-save-notification').addEventListener('click', function () {
    const enabledLineNoti = document.getElementById('setting-enable-line-notification');
    const lineToken = document.getElementById('setting-line-token').value;
    const notiLastAttemptedEle = document.getElementById('setting-last-attempted-notification');
    const notiBlockRewardEle = document.getElementById('setting-found-block-notification');

    const enabledDiscoardWebhook = document.getElementById('setting-enable-discord-notification');
    const discordWebhookUrl = document.getElementById('setting-discord-webhook-url').value;

    let lineNoti = 'N';
    let notiLastAttempted = 'N';
    let notiWhenFoundRewardOnly = 'N';
    if (enabledLineNoti.checked) {
        lineNoti = 'Y';
    }
    if (notiBlockRewardEle.checked) {
        notiWhenFoundRewardOnly = 'Y';
    }
    if (notiLastAttemptedEle.checked) {
        notiLastAttempted = 'Y';
    }

    let discordNoti = 'N';
    if (enabledDiscoardWebhook.checked) {
        discordNoti = 'Y';
    }
    readYaml(configFile, function (err, data) {
        if (err) throw err;
        data.enableLineNotification = lineNoti;
        data.lineToken = lineToken;
        data.lastAttemptedNotification = notiLastAttempted;
        data.blockRewardNotification = notiWhenFoundRewardOnly;
        data.discordWebhookEnabled = discordNoti;
        data.discordWebhookUrl = discordWebhookUrl;
        writeYaml(configFile, data, function (err) {
            if (!err) {
                config = data;
                createDiscordWebhook((data.discordWebhookEnabled === 'Y' ? true : false), data.discordWebhookUrl);
                const ele = document.getElementById('setting-save-notification-message');
                ele.innerText = 'Save successfully.';
                ele.classList.add('save-alert', 'alert', 'alert-success');
                setTimeout(function () {
                    ele.innerText = '';
                    ele.classList.remove('save-alert', 'alert', 'alert-success');
                }, 3000);
            }
        });
    });
});
document.getElementById('setting-save-server').addEventListener('click', function () {
    const enabled = document.getElementById('setting-enable-server');
    const url = document.getElementById('setting-server-url').value;
    let enabledVal = 'N';
    if (enabled.checked) {
        enabledVal = 'Y';
    }
    readYaml(configFile, function (err, data) {
        if (err) throw err;
        data.enableServer = enabledVal;
        data.serverUrl = url;
        writeYaml(configFile, data, function (err) {
            if (!err) {
                config = data;
                if (enabledVal === 'Y') {
                    createWebSocket(enabledVal, url);
                } else {
                    stopWebSocket();
                }
                const ele = document.getElementById('setting-save-server-message');
                ele.innerText = 'Save successfully.';
                ele.classList.add('save-alert', 'alert', 'alert-success');
                setTimeout(function () {
                    ele.innerText = '';
                    ele.classList.remove('save-alert', 'alert', 'alert-success');
                }, 3000);
            }
        });
    });
});

if (fs.existsSync(configFile)) {
    initial();
    hcr([], [], []);
    initialChart();
} else {
    fs.copyFileSync(configFile + '.config', configFile + '.test', fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(infoFile + '.config', infoFile + '.test', fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(lastAttemptedProofFile + '.config', lastAttemptedProofFile + '.test', fs.constants.COPYFILE_EXCL);
    initial();
    hcr([], [], []);
    initialChart();
}
