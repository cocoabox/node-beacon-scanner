const {EventEmitter} = require('events');
const mIbeacon = require('./parser-ibeacon');
const mEddystone = require('./parser-eddystone');
const mEstimote = require('./parser-estimote');

class BeaconScanner extends EventEmitter {
    #lescan;

    /**
     * starts a BeaconScanner with an external Lescan instance
     * @param {Lescan} lescan a switchbot-without-noble:Lescan instance
     * @see https://github.com/cocoabox/switchbot-without-noble/blob/main/src/lescan.js
     */
    constructor(lescan) {
        super();
        this.#lescan = lescan;
        this.#lescan.on('received-merge' , this.#process_merged.bind(this));
    }

    #process_merged({address , reports}) {
        const rssi_arr = reports.map(r => r?.rssi).filter(n => !! n);
        const avg_rssi = rssi_arr.reduce((a , b) => a + b , 0) / rssi_arr.length;
        const combined_data = [].concat(reports.map(r => r?.data ?? [])).flat();
        const manu_data = combined_data.find(cd => cd?.fieldType === 0xFF)?.data;
        const serv_data = combined_data.find(cd => cd?.fieldType === 0x16)?.data?.data;
        // console.log({address , reports , manu_data , serv_data});
        if ( manu_data ) {
            // construct a fake noble-ish peripheral object for SwitchbotAdvertising to parse
            const peripheral = {
                rssi : Math.round(avg_rssi) ,
                advertisement : {
                    serviceData : [
                        {data : serv_data ? Buffer.from(serv_data.reverse()) : null} ,
                    ] ,
                    manufacturerData : manu_data ? Buffer.from(manu_data) : null ,
                }
            };
            const parsed = this.#parse(peripheral);
            if ( parsed ) {
                this.emit('beacon-advertisement' , parsed);
            }
        }
    }

    #detect_beacon_type(peripheral) {
        let ad = peripheral.advertisement;
        let manu = ad.manufacturerData;
        // Eddiystone
        if ( ad.serviceData ) {
            let eddystone_service = ad.serviceData.find((el) => {
                return el.uuid === this._EDDYSTONE_SERVICE_UUID;
            });
            if ( eddystone_service && eddystone_service.data ) {
                // https://github.com/google/eddystone/blob/master/protocol-specification.md
                let frame_type = eddystone_service.data.readUInt8(0) >>> 4;
                if ( frame_type === 0b0000 ) {
                    return 'eddystoneUid';
                } else if ( frame_type === 0b0001 ) {
                    return 'eddystoneUrl';
                } else if ( frame_type === 0b0010 ) {
                    return 'eddystoneTlm';
                } else if ( frame_type === 0b0011 ) {
                    return 'eddystoneEid';
                }
            }
        }
        // iBeacon
        if ( manu && manu.length >= 4 && manu.readUInt32BE(0) === 0x4c000215 ) {
            return 'iBeacon';
        }
        // Estimote Telemetry
        if ( ad.serviceData ) {
            let telemetry_service = ad.serviceData.find((el) => {
                return el.uuid === this._ESTIMOTE_TELEMETRY_SERVICE_UUID;
            });
            if ( telemetry_service && telemetry_service.data ) {
                return 'estimoteTelemetry';
            }
        }
        // Estimote Nearable
        if ( manu && manu.length >= 2 && manu.readUInt16LE(0) === this._ESTIMOTE_COMPANY_ID ) {
            return 'estimoteNearable';
        }
        // Unknown
        return '';
    }

    #parse(peripheral) {
        let ad = peripheral.advertisement;
        let res = {
            id : peripheral.id ,
            address : peripheral.address ,
            localName : ad.localName ,
            txPowerLevel : ad.txPowerLevel ,
            rssi : peripheral.rssi
        };

        let beacon_type = this.#detect_beacon_type(peripheral);
        res['beaconType'] = beacon_type;
        let parsed = null;

        // iBeacon
        if ( beacon_type === 'iBeacon' ) {
            parsed = mIbeacon.parse(peripheral);
            // Eddystone
        } else if ( beacon_type === 'eddystoneUid' ) {
            parsed = mEddystone.parseUid(peripheral);
        } else if ( beacon_type === 'eddystoneUrl' ) {
            parsed = mEddystone.parseUrl(peripheral);
        } else if ( beacon_type === 'eddystoneTlm' ) {
            parsed = mEddystone.parseTlm(peripheral);
        } else if ( beacon_type === 'eddystoneEid' ) {
            parsed = mEddystone.parseEid(peripheral);
            // Estimote
        } else if ( beacon_type === 'estimoteTelemetry' ) {
            parsed = mEstimote.parseTelemetry(peripheral);
        } else if ( beacon_type === 'estimoteNearable' ) {
            parsed = mEstimote.parseNearable(peripheral);
        }

        if ( parsed ) {
            res[beacon_type] = parsed;
            return res;
        } else {
            return null;
        }
    }
}

module.exports = BeaconScanner;
