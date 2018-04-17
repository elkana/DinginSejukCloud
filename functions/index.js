// pls run: $ firebase deploy
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fbutils = require('./fbutils.js');
const exceptions = require('./exceptions.js');
var schedule = require('node-schedule');

const minuteToExpireNewOrder = 5;   // fb dilimit 9 menit max, ga bisa lebih dari itu. kebijakan https://cloud.google.com/functions/docs/concepts/exec
//utk develop 2 menit saja cukup harusnya

admin.initializeApp(functions.config().firebase);

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions
//
/*
exports.helloWorld = functions.https.onCall((data, context) => {

    var nama;
    
    console.log('requestquery=' + data.customerName);
    
    if (data){
        nama = data.customerName;
    }

    var car = {angka:888, msg:'Hello ' + nama + ' from Firebase !'};
    
    return car;
});
*/


function createOrderHeader(orderHeader){
    
    return fbutils.Order_GetCustomerPendingRef(orderHeader.customerId, orderHeader.uid) 
    .update(orderHeader)
    .then(() => {

        fbutils.Order_GetConstraintRef(orderHeader.customerId,
                                        orderHeader.addressId,
                                        orderHeader.partyId,
                                        orderHeader.dateOfService
                                    ).set({ createdTimestamp : Date.now()});

        return orderHeader;
    })
    .catch((error) => { 
        throw new functions.https.HttpsError('unknown', error.message, error);
    })
}

function createOrderBucket(orderBucket){

   return fbutils.Order_GetMitraPendingRef(orderBucket.partyId, orderBucket.uid)
    .update(orderBucket)
    .then(() => {
        return orderBucket;
    })
    .catch((error) => { 
        throw new functions.https.HttpsError('unknown', error.message, error);
    })
}

/*
public static List<TechnicianReg> getAllTechnicianRegByScoring(long bookingTimestamp) {
    List<TechnicianReg> techList = getAllTechnicianReg(true);

    List<TechnicianReg> priorityList = new ArrayList<>();

    Realm r = Realm.getDefaultInstance();
    try{
        MobileSetup mSetup = r.where(MobileSetup.class).findFirst();

        String waktuHariBooking = DateUtil.displayTimeInJakarta(bookingTimestamp, "yyyyMMdd");

        for (TechnicianReg tech : techList) {
            //1. cek max order
            long _count = r.where(JobsAssigned.class)
                    .equalTo("techId", tech.getTechId())
                    .like("wkt", waktuHariBooking + "*")
                    .count();

            if (_count > mSetup.getMaxOrderPerTechnician()) {
                continue;
            }

            //2. nearby ?

            priorityList.add(tech);
        }
    } finally {
        r.close();
    }

    return priorityList;
}
*/

function notifyNewOrderToTechnician(techId, orderBucket){
    var item = {
        acCount : orderBucket.acCount,
        address : orderBucket.addressByGoogle,
        customerId : orderBucket.customerId,
        customerName : orderBucket.customerName,
        mitraId : orderBucket.partyId,
        orderId : orderBucket.uid,
        orderTimestamp : orderBucket.bookingTimestamp,
        mitraTimestamp : orderBucket.updatedTimestamp,
        minuteExtra: minuteToExpireNewOrder, 
        // mitraTimestamp : Date.now(),
        techId : techId
    }

    return fbutils.TechnicianReg_getNotifyNewOrderRef(item.mitraId, item.techId)
        .child(item.orderId)
        .update(item)
        .then(snap => {
            // https://github.com/invertase/react-native-firebase/issues/151
            let payload = {
                notification: {
                  title: `New Order from ${item.customerName}`,
                  body: item.address,                  
                },
                data:{
                    bookingTimestamp: orderBucket.bookingTimestamp.toString(),
                   // "Nick" : "Mario",
                   // "body" : "great match!",
                   // "Room" : "PortugalVSDenmark"
                  }
              }
            
              fbutils.getTechTokens(item.techId)
                .then(result => {
                    
                    const token = result[0];

                    if (token){
                        console.log(`sending notification to ${item.techId} [token=${token}]`);
                        // admin.messaging().sendToDevice(token, payload); sementara disable sampe production     
                    }

                }).catch(err => console.error(err));

        })

}

/*
exports.testFunc_getAllTechnicianReg = functions.https.onCall((data, context) =>{
    const mitraId = data.mitraId;

    console.log("mitraId is " + mitraId);

    const techRegList = fbutils.getAllTechnicianReg(mitraId);

    return Promise.all([techRegList])
        .then(data => {
            return data[0];
    });

    
});
*/

// this function will notify Mitra and Technician
exports.createBooking = functions.https.onCall((orderHeader, context) => {

    // Checking that the user is authenticated.
    if (!context.auth) {
        // Throwing an HttpsError so that the client gets the error details.
        throw new functions.https.HttpsError('failed-precondition', "The function must be called " +
            "while authenticated.");
    }

    if (!orderHeader)
        throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');


    const userId = context.auth.uid;
    const enableExpiryOrder = true;


    // minimal booking adalah 2 jam dari sekarang. harus dicocokkan dengan /master/mSetup/1/minimal_booking_hour
    var today = new Date();
    today.setHours(today.getHours() + 2);

    if (orderHeader.bookingTimestamp < today.getMilliseconds())
        throw new functions.https.HttpsError('aborted', 'Invalid Booking time');

    // autofix
    if (!orderHeader.uid)
        orderHeader.uid = admin.database().ref(fbutils.FB_CONSTANTS.REF_ORDERS_CUSTOMER_AC_PENDING)
                    .child(userId)
                    .push()
                    .key;

    //var sOrderHeader_OrderBucket = JSON.stringify(data) + ',' + JSON.stringify(orderBucket);
    
    // console.log('userId is ' + userId);
    // console.log('orderId is ' + orderHeader.uid);

    return fbutils.IsBookingConstraints(orderHeader)
    .then(result => {
        if (result)
            throw new functions.https.HttpsError('already-exists', 'Booking already exists');            

        console.log(`constuct booking data for ${orderHeader.uid}`);

        // replace property
        // orderHeader.invoiceNo = invoiceBuilder();    belum siap.
        orderHeader.createdTimestamp = Date.now();
        orderHeader.updatedTimestamp = orderHeader.createdTimestamp;
        orderHeader.updatedStatusTimestamp = orderHeader.createdTimestamp;
        orderHeader.updatedBy = fbutils.FB_CONSTANTS.USER_AS_COSTUMER.toString();

        const cust = createOrderHeader(orderHeader);

        const orderBucket = {
            uid: orderHeader.uid,
            invoiceNo: orderHeader.invoiceNo,
            acCount: orderHeader.jumlahAC,
            customerId : orderHeader.customerId,
            customerName : orderHeader.customerName,
            addressByGoogle: orderHeader.addressByGoogle,
            statusDetailId: orderHeader.statusDetailId,
            partyId: orderHeader.partyId,
            technicianId: orderHeader.technicianId,
            minuteExtra: minuteToExpireNewOrder + 2, 
            bookingTimestamp: orderHeader.bookingTimestamp,
            updatedTimestamp: orderHeader.updatedTimestamp, // disamakan saja
            updatedBy: fbutils.FB_CONSTANTS.USER_AS_COSTUMER.toString(),
            
        }
        
        const mitra = createOrderBucket(orderBucket);

        // supaya lbh cepat respon, ga perlu nunggu mitra
        return Promise.all([cust,mitra])
        // return Promise.all([cust,mitra])
        .then(() =>{

            // notify to all technician
            fbutils.getAllTechnicianReg(orderHeader.partyId)
                .then(data => {

                    for (var i = 0; i < data.length; i++){
                        var _techId = data[i].techId;
        
                        notifyNewOrderToTechnician(_techId, orderBucket);
                    }
        
                });

            // run external cron, gave all technician 10 minutes to accept new order with CREATED status
            // jika dalam 7 menit status belum berubah dari CREATED maka status jadi UNHANDLED
            // fbutils.orderCreatedLifetime(orderHeader.customerId, orderHeader.uid, 7);

        })
        .then(() => {

            if (enableExpiryOrder){

                new Promise(function(resolve, reject) { 

                    const _customerId = orderHeader.customerId;
                    const _orderId = orderHeader.uid;
                    const _minuteExtra = orderBucket.minuteExtra;

                    console.log(`Timer for order ${_orderId} started for ${_minuteExtra} minutes`);

                    setTimeout(() => {

                        console.log(`EXPIRED ${_minuteExtra} minute Timer for order ${_orderId}`);

                        fbutils.Order_NewOrderExpired(_customerId, _orderId)
                            .then(result => {
                                // console.log('heres the result');
                                // console.log(result);
                            });

                        resolve();
                    },  (_minuteExtra * 60 * 1000));

                    
                });
                // setTimeout(function hello1(){
                //     console.log(`helloooo Timeout, expiring ${orderHeader.customerId} and ${orderHeader.uid}`);
                // }, 15000);

                // var date = Date.now() + ((minuteToExpireNewOrder + 2) * 60 * 1000);//req.body.date;   // Date for reminder from client request 
                // var date = Date.now() + 15000;//req.body.date;   // Date for reminder from client request 
                // var j = schedule.scheduleJob(date, function(){
                //     console.log(`helloooo, expiring ${orderHeader.customerId} and ${orderHeader.uid}`);
                //     // fbutils.checkExpiredOrder(_customerId, _orderId);
                // });    
            }

            var resp = {
                orderKey: orderHeader.uid,
                timestamp: Date.now()
            };

            return resp;
        })    
    
    })

        
});


exports.checkExpiredBooking = functions.https.onCall((data, context) =>{
        // Checking that the user is authenticated.
        if (!context.auth) {
            // Throwing an HttpsError so that the client gets the error details.
            throw new functions.https.HttpsError('failed-precondition', "The function must be called " +
                "while authenticated.");
        }
    
        if (!data)
            throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');

    // anyone can check this using external cron
    const customerId = data.customerId;
    const orderId = data.orderId;

    if (!data || !customerId || !orderId)
        throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');
        
    return fbutils.checkExpiredOrder(customerId, orderId)
    .then(result => {
        if (result){

        } else {

        }

        console.log(result);
    })

})

exports.cancelBooking = functions.https.onCall((data, context) =>{
        // Checking that the user is authenticated.
        if (!context.auth) {
            // Throwing an HttpsError so that the client gets the error details.
            throw new functions.https.HttpsError('failed-precondition', "The function must be called " +
                "while authenticated.");
        }
    
        if (!data)
            throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');

    // anyone can check this using external cron
    const customerId = data.customerId;
    const orderId = data.orderId;
    const cancelStatus = data.cancelStatus; // cuma ada 3 macam, CANCELLED_BY_CUSTOMER, CANCELLED_BY_SERVER dan CANCELLED_BY_TIMEOUT
    const cancelReason = data.cancelReason === undefined ? null : data.cancelReason;

    if (!data || !customerId || !orderId || !cancelStatus)
        throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');

    // return fbutils.cancelOrderBy(customerId, orderId, fbutils.BOOKINGSTATUS.CANCELLED_BY_CUSTOMER)
    return fbutils.cancelOrderBy(customerId, orderId, cancelStatus, cancelReason)
    .then(result => {
        if (result){

        } else {

        }

        var resp = {
            timestamp: Date.now()
        };

        return resp;
    })
    .catch(error => {

        if (error instanceof exceptions.OrderException)
            throw new functions.https.HttpsError('failed-precondition', error.message, error);
        else
            throw new functions.https.HttpsError('unknown', error.message, error);

    })

})

exports.rescheduleBooking = functions.https.onCall((data, context) =>{
    // anyone can check this using external cron
    const customerId = data.customerId;
    const orderId = data.orderId;
    const newDateInLong = data.newDateInLong;

    if (!data || !customerId || !orderId || !newDateInLong)
        throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');
    
    return fbutils.rescheduleOrder(newDateInLong, customerId, orderId)
    .then(result => {
        if (result){

        } else {

        }

        var resp = {
            timestamp: Date.now()
        };

        return resp;
    })
    .catch(error => {
        if (error instanceof exceptions.OrderException)
            throw new functions.https.HttpsError('failed-precondition', error.message, error);
        else
            throw new functions.https.HttpsError('unknown', error.message, error);

    })


})


exports.grabOrder = functions.https.onCall((data, context) => {
        // Checking that the user is authenticated.
        if (!context.auth) {
            // Throwing an HttpsError so that the client gets the error details.
            throw new functions.https.HttpsError('failed-precondition', "The function must be called " +
                "while authenticated.");
        }
    
        if (!data)
            throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');

        const orderId = data.orderId;
        const mitraId = data.mitraId;
        const customerId = data.custId;
        const technicianId = data.techId;
        const technicianName = data.techName;

        // cek already taken ?
        return fbutils.Order_GetCustomerPendingRef(customerId, orderId)
            .child('technicianId')
            .once('value')
            .then(snap => {
                console.log('grabOder check technicianId=' + snap.val());

                // kalau udah ada brarti sudah ada yg assign                
                if (snap.exists()){
                    fbutils.TechniciansReg_deleteAllNotifyNewOrder(mitraId);    //clean up all notify_new_order

                    throw new functions.https.HttpsError('already-exists', 'Order already taken');
                }
                    

                    // build assignment first to get assignmentid, then update orderheader
                const _orderRef = fbutils.Order_GetCustomerPendingRef(customerId, orderId)
                                    .once('value')
                                    .then(snap => {
                                        const _orderHeader = snap.val();

                                        // cannot assign finished status
                                        if (_orderHeader.statusId === fbutils.BOOKINGSTATE.FINISHED)
                                            throw new functions.https.HttpsError('failed-precondition', 'Failed to create assignment. Order status already finished.');

                                        // _orderHeader.technicianId = technicianId;
                                        // _orderHeader.technicianName = technicianName;
                                        // _orderHeader.assignmentId = _orderHeader.uid;

                                        const _now = Date.now();

                                        // to create assignment id, no need to generate new id, just use same order id as child node
                                        const _newAssignment = {
                                            uid : _orderHeader.uid,
                                            technicianId : technicianId,
                                            technicianName : technicianName,
                                            dateOfService : _orderHeader.dateOfService,
                                            timeOfService : _orderHeader.timeOfService,
                                            statusDetailId : _orderHeader.statusDetailId,
                                            updatedBy : fbutils.FB_CONSTANTS.USER_AS_MITRA.toString(),
                                            customerAddress : _orderHeader.addressByGoogle,
                                            customerId : _orderHeader.customerId,
                                            customerName : _orderHeader.customerName,
                                            latitude : _orderHeader.latitude,
                                            longitude : _orderHeader.longitude,
                                            orderId : _orderHeader.uid, // buat cadangan versi lama. harusnya udah ga kepake krn assigmentid is orderid
                                            mitraId : _orderHeader.partyId,
                                            mitraName : _orderHeader.partyName,
                                            serviceType : _orderHeader.serviceType,
                                            updatedTimestamp : _now,
                                            createdDate : _now,

                                        }

                                        fbutils.Assignment_GetPendingRef(technicianId, _newAssignment.uid)
                                            .child('assign')
                                            .set(_newAssignment);

                                        // update customer node
                                        const _updatedOrderHeader = {
                                            assignmentId : _newAssignment.uid,
                                            technicianId : technicianId,
                                            technicianName : technicianName,
                                            statusDetailId : fbutils.BOOKINGSTATUS.ASSIGNED.toString(),
                                            updatedTimestamp : Date.now(),
                                            updatedBy : fbutils.FB_CONSTANTS.USER_AS_MITRA.toString(),
                                        }

                                        const _updatedOrderBucket = {
                                            assignmentId : _newAssignment.uid,
                                            technicianId : technicianId,
                                            technicianName : technicianName,
                                            statusDetailId : fbutils.BOOKINGSTATUS.ASSIGNED.toString(),
                                            updatedTimestamp : Date.now(),
                                            updatedBy : fbutils.FB_CONSTANTS.USER_AS_MITRA.toString(),
                                        }

                                        fbutils.Order_GetCustomerPendingRef(customerId, orderId)
                                            .update(_updatedOrderHeader);

                                        // update mitra node
                                        fbutils.Order_GetMitraPendingRef(mitraId, orderId)
                                            .update(_updatedOrderBucket);

                                        //clean up all notify_new_order
                                        fbutils.TechniciansReg_deleteAllNotifyNewOrder(mitraId);    
                                    });

            }).catch(error => {throw new functions.https.HttpsError('unknown', error.message, error)})
            .then(() => {
                var resp = {
                    timestamp: Date.now()
                };
    
                return resp;
            }); 
})
/*
exports.grabOrderOld = functions.https.onCall((data, context) => {
    // Checking that the user is authenticated.
    if (!context.auth) {
        // Throwing an HttpsError so that the client gets the error details.
        throw new functions.https.HttpsError('failed-precondition', "The function must be called " +
            "while authenticated.");
    }

    if (!data)
        throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');

    const orderId = data.orderId;
    const mitraId = data.mitraId;

    // cek already taken ?
    const existingFightRef = fbutils.Assignment_FightRef(orderId).child('techId');

    return fbutils.IsRefExists(existingFightRef)
    .then(result => {
        if (result)
            throw new functions.https.HttpsError('already-exists', 'Order already taken');
        
            // TODO no more fight ? just listen to orderheader.technicianId atau assignment node ?

            return fbutils.Assignment_FightRef(orderId)   
                .set(data)
                .then(result => {
                    // delete all
                    return fbutils.TechniciansReg_deleteAllNotifyNewOrder(mitraId);                        
                })
        
    })
    .catch(error => {
        // utk catch apa yg terjadi di then
        throw new functions.https.HttpsError('unknown', error.message, error);
    })

})
*/

// fungsi ini dapat dipanggil oleh customer dan mitra
exports.requestStatusCheck = functions.https.onCall((data, context) => {
    // Checking that the user is authenticated.
    if (!context.auth) {
        // Throwing an HttpsError so that the client gets the error details.
        throw new functions.https.HttpsError('failed-precondition', "The function must be called " +
            "while authenticated.");
    }

    if (!data)
        throw new functions.https.HttpsError('invalid-argument', 'parameters are not well configured');

    const orderId = data.orderId;
    const customerId = data.customerId;
    const requestBy = data.requestBy;   // '10' , '20' or '30'

    const orderRef = fbutils.Order_GetCustomerPendingRef(customerId, orderId);

    return fbutils.GetSnapShotFromRef(orderRef)
        .then(orderHeader => {
            if (!orderHeader)
                return false;

            // CHECK Apakah expired ?
            const startMillis = orderHeader.updatedStatusTimestamp + (orderHeader.life_per_status_minute * 60 * 1000);
            const remainingMillis = startMillis - Date.now();
            const counterDate = new Date(remainingMillis);

            console.log(`Remaining time for order ${orderId} status ${orderHeader.statusDetailId} is ${remainingMillis} -> ${counterDate}`);

            const expired = remainingMillis <= 0;

            // kalo status CREATED dan expired, ubah jadi ke UNHANDLED hapus semua notifyneworder ?
            if (expired){
                if (orderHeader.statusDetailId === fbutils.BOOKINGSTATUS.CREATED){
                    return fbutils.Order_SetStatus(customerId, orderId, fbutils.BOOKINGSTATUS.UNHANDLED, null, requestBy)
                        .then(() =>{

                            fbutils.TechniciansReg_deleteAllNotifyNewOrder(orderHeader.partyId);
                            
                            return true;
                        });

                }
    
            } else {

            }

            return true;
        })
        .catch(error => {
            // utk catch apa yg terjadi di then
            throw new functions.https.HttpsError('unknown', error.message, error);
        })
        .then(() => {
                var resp = {
                    timestamp: Date.now()
                };
    
                return resp;
        })
})
