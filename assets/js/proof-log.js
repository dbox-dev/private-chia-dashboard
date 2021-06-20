function logProof(d, t, p) {
    const logFile = logPath.concat('\\proof-' + d + '.json');
    if (!fs.existsSync(logFile)) {
        fs.appendFile(logFile, '[]', function (err) {
            if (err) console.error(err);
            if (!err) {
                writeProofLog(logFile, d, t, p);
            }
        });
    } else {
        writeProofLog(logFile, d, t, p);
    }
}

function writeProofLog(logFile, d, t, p) {
    jsonfile.readFile(logFile, function (err, obj) {
        if (err) console.error(err);
        if (!err) {
            const log = {
                date: d,
                time: t,
                plots: p
            };
            obj.push(log);
            jsonfile.writeFile(logFile, obj, function (err) {
                if (err) {
                    console.error(err);
                }
            });
        }
    });
}