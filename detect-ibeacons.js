#!/usr/bin/env node
const BeaconScanner = require('./lib/scanner-ex');
const {Lescan} = require('switchbot-without-noble');

async function do_scan(hci , time) {
    const scan_duration = time ? parseInt(time) : null;
    if ( isNaN(scan_duration) ) {
        console.warn('invalid --time :' , time);
        process.exit(1);
    }
    const lescan = new Lescan(hci);
    const bye = async () => {
        console.warn('GOODBYE');
        await lescan.stop();
        process.exit(0);
    };
    process.on('SIGINT' , bye);
    process.on('SIGTERM' , bye);
    try {
        const scanner = new BeaconScanner(lescan);
        scanner.on('beacon-advertisement' , (ad) => {
            console.log(JSON.stringify(ad));
        });
        await lescan.start();
        if ( typeof scan_duration === 'number' )
            setTimeout(async () => {
                lescan.stop();
                bye();
            } , parseInt(scan_duration) * 1000);
    } catch (err) {
        console.warn('SORRY:' , err);
        process.exit(2);
    }
}

(async () => {
    console.warn('scan start');
    const hci = parseInt(process.argv[2] ?? 'hci0');
    process.exit(0);
    await do_scan(hci);
})();

