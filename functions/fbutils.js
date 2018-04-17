// dont confuse between order & booking. its the same thing.
const admin = require('firebase-admin');
const error = require('./exceptions.js');
const self = this;

module.exports.FB_CONSTANTS = {
    REF_ASSIGNMENTS_PENDING : 'orders/ac/pending/teknisi',
    //REF_ASSIGNMENTS_PENDING : 'assignments/ac/pending',
    //REF_ORDERS_AC_PENDING : 'orders/ac/pending',
    //REF_ASSIGNMENTS_FIGHT : 'assignments/ac/fight',   udah ga kepake sejak pake cloudfunction
    REF_ORDERS_CUSTOMER_AC_PENDING : 'orders/ac/pending/customer',
    REF_ORDERS_MITRA_AC_PENDING : 'orders/ac/pending/mitra',
    REF_MITRA_AC : "mitra/ac",
    USER_AS_COSTUMER : 10,
    USER_AS_MITRA : 20,
    USER_AS_TECHNICIAN : 30
};

module.exports.BOOKINGSTATUS = {
    UNKNOWN: 'UNKNOWN',
    CREATED: 'CREATED',
    UNHANDLED: 'UNHANDLED',
    ASSIGNED: 'ASSIGNED',
    OTW: 'OTW',
    WORKING: 'WORKING',
    PAYMENT: 'PAYMENT',
    PAID: 'PAID',
    CANCELLED_BY_TIMEOUT: 'CANCELLED_BY_TIMEOUT', 
    CANCELLED_BY_SERVER: 'CANCELLED_BY_SERVER',
    CANCELLED_BY_CUSTOMER: 'CANCELLED_BY_CUSTOMER', 
    INVALID_BOOKING: 'INVALID_BOOKING',
}

module.exports.BOOKINGSTATE = {
    PENDING: 'PENDING', 
    FINISHED: 'FINISHED'
}


Date.prototype.customFormat = function(formatString){
    var YYYY,YY,MMMM,MMM,MM,M,DDDD,DDD,DD,D,hhhh,hhh,hh,h,mm,m,ss,s,ampm,AMPM,dMod,th;
    YY = ((YYYY=this.getFullYear())+"").slice(-2);
    MM = (M=this.getMonth()+1)<10?('0'+M):M;
    MMM = (MMMM=["January","February","March","April","May","June","July","August","September","October","November","December"][M-1]).substring(0,3);
    DD = (D=this.getDate())<10?('0'+D):D;
    DDD = (DDDD=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][this.getDay()]).substring(0,3);
    th=(D>=10&&D<=20)?'th':((dMod=D%10)==1)?'st':(dMod==2)?'nd':(dMod==3)?'rd':'th';
    formatString = formatString.replace("#YYYY#",YYYY).replace("#YY#",YY).replace("#MMMM#",MMMM).replace("#MMM#",MMM).replace("#MM#",MM).replace("#M#",M).replace("#DDDD#",DDDD).replace("#DDD#",DDD).replace("#DD#",DD).replace("#D#",D).replace("#th#",th);
    h=(hhh=this.getHours());
    if (h==0) h=24;
    if (h>12) h-=12;
    hh = h<10?('0'+h):h;
    hhhh = hhh<10?('0'+hhh):hhh;
    AMPM=(ampm=hhh<12?'am':'pm').toUpperCase();
    mm=(m=this.getMinutes())<10?('0'+m):m;
    ss=(s=this.getSeconds())<10?('0'+s):s;
    return formatString.replace("#hhhh#",hhhh).replace("#hhh#",hhh).replace("#hh#",hh).replace("#h#",h).replace("#mm#",mm).replace("#m#",m).replace("#ss#",ss).replace("#s#",s).replace("#ampm#",ampm).replace("#AMPM#",AMPM);
};

function snapshotToArray(snapshot) {
    var returnArr = [];

    snapshot.forEach(function(childSnapshot) {
        var item = childSnapshot.val();
        item.key = childSnapshot.key;

        returnArr.push(item);
    });

    return returnArr;
};

/*
module.exports.Assignment_FightRef = function(orderId){
    return admin.database().ref(self.FB_CONSTANTS.REF_ASSIGNMENTS_FIGHT)        
        .child(orderId);
}*/

module.exports.Assignment_GetPendingRef = function(technicianId, assignmentId){
    return admin.database().ref(self.FB_CONSTANTS.REF_ASSIGNMENTS_PENDING)    
        .child(technicianId)
        .child(assignmentId);
}

module.exports.Assignment_Delete = function(technicianId, assignmentId){
    if (!lastAssignmentId || !assignmentId)
        return;

    return self.Assignment_GetPendingRef(technicianId, assignmentId)
        .remove();
}

module.exports.Order_GetCustomerPendingRef = function(customerId, orderId){
    return admin.database().ref(self.FB_CONSTANTS.REF_ORDERS_CUSTOMER_AC_PENDING)    
        .child(customerId)
        .child(orderId);
}

module.exports.Order_GetMitraPendingRef = function(mitraId, orderId){
    return admin.database().ref(self.FB_CONSTANTS.REF_ORDERS_MITRA_AC_PENDING)    
        .child(mitraId)
        .child(orderId);
}

// return boolean
module.exports.Order_DeleteConstraint = function(customerId, addressId, partyId, dateOfServiceYYYYMMDD){
    
    const _orderConstraintRef = self.Order_GetConstraintRef(customerId, addressId, partyId, dateOfServiceYYYYMMDD);
    
    return self.IsRefExists(_orderConstraintRef)
            .then(result => {
                if (!result)
                    return false;

                return _orderConstraintRef
                    .remove(function (error){
                        return !!error;
                    })
            })

    
}

module.exports.Order_GetConstraintRef = function(customerId, addressId, partyId, dateOfServiceYYYYMMDD){
    const key = customerId + '_' +
                self.EncodeKey(addressId) + '_' +
                partyId + '_' +
                dateOfServiceYYYYMMDD ;

    return admin.database().ref(self.FB_CONSTANTS.REF_ORDERS_CUSTOMER_AC_PENDING)    
        .child('constraints')
        .child(customerId)
        .child(key);

            //    OrderHeader first = _realm.where(OrderHeader.class)
    //    .equalTo("addressId", finalAlamat)
    //    .equalTo("partyId", mitraObj.getUid())
    //    .equalTo("dateOfService", kapanYYYYMMDD)
    //    .notEqualTo("statusId", EOrderStatus.FINISHED.name())
    //    .findFirst();    
}

// javascript cant overloading function
// module.exports.Order_GetConstraintRef = function(orderHeader){
//         return self.Order_GetConstraintRef(orderHeader.customerId,
//                                     orderHeader.addressId,
//                                     orderHeader.partyId,
//                                     orderHeader.dateOfService);
// }
module.exports.Order_SetStatus = function(customerId, orderId, newStatus, newStatusComment, updatedBy){

    const orderRef = self.Order_GetCustomerPendingRef(customerId, orderId);

    return self.GetSnapShotFromRef(orderRef)
        .then(orderHeader => {
            if (!orderHeader){
                return false;
            }

            const mitraId = orderHeader.partyId;
            const dateOfService = new Date(orderHeader.bookingTimestamp);
            // console.log(orderHeader.customerName);
            const now = Date.now();

            var updatedData = {
                statusDetailId: newStatus,
                statusComment: newStatusComment,
                updatedTimestamp: now,
                updatedStatusTimestamp: now,
                updatedBy: updatedBy,
            }

            if (newStatus === self.BOOKINGSTATUS.CANCELLED_BY_CUSTOMER
                || newStatus === self.BOOKINGSTATUS.CANCELLED_BY_SERVER
                || newStatus === self.BOOKINGSTATUS.CANCELLED_BY_TIMEOUT
            ){
                updatedData = {
                    statusId: self.BOOKINGSTATE.FINISHED,       // <-- important
                    statusDetailId: newStatus,
                    statusComment: newStatusComment,
                    updatedTimestamp: now,
                    updatedBy: updatedBy,                        
                }

                // delete constraint
                self.Order_DeleteConstraint(customerId, orderHeader.addressId, mitraId, dateOfService.customFormat("#YYYY##MM##DD#"));
                // TODO
                // Mitra_GetTechnicianRef(orderBucket.getPartyId(), orderBucket.getTechnicianId())
                // .child("jobs_cancelled")
                // .child(_wkt)
                // .setValue(orderBucket.getUid()).addOnCompleteListener(new OnCompleteListener<Void>() {

                // TODO tp msh tentative krn sementara ga bisa dipindah ke cloud krn status PAID hanya dilakukan oleh customer
                    // Mitra_GetTechnicianRef(orderBucket.getPartyId(), orderBucket.getTechnicianId())
                    // .child("jobs_history")
                    // .child(_wkt)
                    // .setValue(orderBucket.getUid()).addOnCompleteListener(new OnCompleteListener<Void>() {

            }

            const _orderHeader = orderRef.update(updatedData).then(() => {
                                    })
                                    .catch(err => console.error(err));

            const _orderBucket = self.Order_GetMitraPendingRef(mitraId, orderId)
                                    .update(updatedData)
                                    .then(() => {
                                    })
                                    .catch(err => console.error(err));

            var promises = [_orderHeader, _orderBucket];

            const technicianId = orderHeader.technicianId;
            const assignmentId = orderHeader.assignmentId;            

            if (technicianId && assignmentId){
                console.log(`Assignment exists, updating status of order ${orderId}`);

                const _assignment = self.Assignment_GetPendingRef(technicianId, assignmentId); 
                if (self.IsRefExists(_assignment)){
    
                    _assignment.child('assign').update(updatedData).then(() => {
                    });

                    // no need to wait
                    // promises.push(_assignment);
                }

                // WARNING ! Tidak akan efisien jika Teknisi tidak memanggil funsi setstatus dicloud
                if (newStatus === self.BOOKINGSTATUS.OTW){

                    // const _wktBooking = dateOfService.customFormat("#YYYY##MM##DD##hh##mm#");

                    // const _jobsAssigned = self.Mitra_GetTechnicianRef(mitraId, technicianId)
                    //                         .child('jobs_assigned')
                    //                         .child(_wktBooking)
                    //                         .update(_orderBucket.uid).then(() => {})
                    //                         .catch(err => console.error(err));
                // TODO kalau status OTW
                // Mitra_GetTechnicianRef(orderBucket.getPartyId(), orderBucket.getTechnicianId())
                //         .child("jobs_assigned")
                //         .child(_wkt)
                //         .setValue(orderBucket.getUid()).addOnCompleteListener(new OnCompleteListener<Void>() {
                //     @Override
                //     public void onComplete(@NonNull Task<Void> task) {

                    // promises.push(_jobsAssigned);
                }
                
            }
            

            return Promise.all(promises)
                .then(data => {
                    console.log(`Done updating status of order ${orderId}`);
                    return true;
                });
        })
       
}


module.exports.IsBookingConstraints = function(orderHeader){
    return self.IsRefExists(self.Order_GetConstraintRef(orderHeader.customerId,
                orderHeader.addressId,
                orderHeader.partyId,
                orderHeader.dateOfService))
    .then(data =>{
        return data;
    });
}

// unfinished 4 apr 18
module.exports.checkExpiredOrder = function(customerId, orderId){
    // the goal is anyone can call this to update order status

    const orderRef = self.Order_GetCustomerPendingRef(customerId, orderId);

    return self.IsRefExists(orderRef)
        .then(result => {
            if (!result){
                return false;
            }

            // get information of related booking
            return orderRef.once('value')
            .then((snap) => {
                const obj = snap.val();
                
                if (obj.statusDetailId === self.BOOKINGSTATUS.UNHANDLED){

                }

                console.log(`TODO expired booking with status ${obj.statusDetailId}`);

                return true;
            });

        });
};

// called by internal timer when new order/booking created
module.exports.Order_NewOrderExpired = function(customerId, orderId){

    const orderRef = self.Order_GetCustomerPendingRef(customerId, orderId);

    return self.IsRefExists(orderRef)
        .then(result => {
            if (!result){
                return false;
            }

            // get information of related booking
            return orderRef.once('value')
            .then((snap) => {
                const obj = snap.val();
                
                console.log(`TODO Order_NewOrderExpired with status ${obj.statusDetailId}`);

                const _mitraId = obj.partyId;

                if (obj.statusDetailId === self.BOOKINGSTATUS.CREATED){
                    return self.Order_SetStatus(customerId, orderId, self.BOOKINGSTATUS.UNHANDLED, null, self.FB_CONSTANTS.USER_AS_MITRA.toString())
                        .then(() =>{

                            self.TechniciansReg_deleteAllNotifyNewOrder(_mitraId);
                            
                            return true;
                        });
                    
                } else
                    return false;

            });

        });
};


module.exports.orderCreatedLifetime = function(customerId, uid, minutes){
    console.log('TODO orderCreatedLifetime');
    
    // ccheck order masih ada ?

    // kalo status masih CREATED maka ubah status menjadi UNHANDLED

    // ambil referensi technicianReg utk dihapus notifyneworder

    // apakah assignment/fight juga bisa ada ya ?
    
}


module.exports.Mitra_GetTechnicianRef = function(mitraId, techId){
    return admin.database().ref(self.FB_CONSTANTS.REF_MITRA_AC)    
        .child(mitraId)
        .child('technicians')
        .child(techId);
}

module.exports.Mitra_GetTechniciansRef = function(mitraId){
    return admin.database().ref(self.FB_CONSTANTS.REF_MITRA_AC)    
        .child(mitraId)
        .child('technicians');
}

module.exports.TechnicianReg_getNotifyNewOrderRef = function(mitraId, techId){
    return self.Mitra_GetTechnicianRef(mitraId, techId)
        .child('notify_new_order');
}

module.exports.TechnicianReg_deleteNotifyNewOrder = function(mitraId, techId, orderId){
    if (!techId || !mitraId || !orderId)
        return;
        
    return self.TechnicianReg_getNotifyNewOrderRef(mitraId, techId)
        .child(orderId)
        .remove()
        ;
}

module.exports.TechniciansReg_deleteAllNotifyNewOrder = function(mitraId){

    return self.getAllTechnicianReg(mitraId)
            .then(techRegs => {

                if (!techRegs)
                    return false;

                for (var i = 0; i < techRegs.length; i++){
                    var _techId = techRegs[i].techId;
                    
                    console.log(`[${i}]= deleting notify_new_order of ${_techId}`);

                    self.TechnicianReg_getNotifyNewOrderRef(mitraId, _techId)
                        .remove();
                }

            });
}



module.exports.User_GetRef = function(customerId){
    return admin.database().ref('users')    
        .child(customerId);
}

module.exports.isUserExists = function(userId){
    return self.User_GetRef(userId)
        .once('value')
        .then(snap => {
            return snap.exists();
        });
}

module.exports.Mitra_GetRef = function(mitraId){
    return admin.database().ref('mitra')    
        .child('ac')
        .child(mitraId);
}

module.exports.Technician_GetRef = function(technicianId){
    return admin.database().ref('technicians')    
        .child('ac')
        .child(technicianId);
}

module.exports.getUserTokens = function(userId){
    return self.User_GetRef(userId)
        .child('firebaseToken')
        .once('value')
        .then(snap => {
            return snapshotToArray(snap);
        });
}

module.exports.getMitraTokens = function(mitraId){
    return self.Mitra_GetRef(mitraId)
        .child('firebaseToken')
        .once('value')
        .then(snap => {
            return snapshotToArray(snap);
        });
}

module.exports.getTechTokens = function(technicianId){
    return self.Technician_GetRef(technicianId)
        .child('firebaseToken')
        .once('value')
        .then(snap => {
            return snapshotToArray(snap);
        });
}

module.exports.getAllUsers = function (){

    return admin.database().ref("users")
        .once('value')
        .then(snap => {
            var rows = snapshotToArray(snap);

            return rows;
        })    
}

module.exports.getAllTechnicianReg = function(mitraId){
    return self.Mitra_GetTechniciansRef(mitraId)
        .once('value')
        .then(snap => {
            var techRegData = [];

            techRegData = snapshotToArray(snap);

            return techRegData;
        })    
}

module.exports.GetSnapShotFromRef = function(databaseRef){
    return databaseRef
        .once('value')
        .then(snap => {
            if (snap.exists())
                return snap.val();
            else
                return null;
        });    
}

module.exports.IsRefExists = function(databaseRef){
    return databaseRef
        .once('value')
        .then(snap => {
            return snap.exists();
        });    
}

module.exports.rescheduleOrder = function(newDateInLong, customerId, orderId){
    
    // kalo ada technicianId dan assignmentId maka node assignment dan notifyneworder akan dihapus krn status menjadi CREATED lagi
    const orderRef = self.Order_GetCustomerPendingRef(customerId, orderId);

    return self.IsRefExists(orderRef)
            .then(result => {
                if (!result){
                    return false;
                }

                return orderRef.once('value')
                    .then(snap => {
                        const obj = snap.val();
                        
                       // console.log(obj);
                        if (obj.rescheduleCounter > 0) {
                            throw new error.OrderException(`Sorry, too much reschedule.`);
                        }

                        // hanya bisa di status UNHANDLED dan ASSIGNED
                        if (obj.statusDetailId === self.BOOKINGSTATUS.UNHANDLED
                            || obj.statusDetailId === self.BOOKINGSTATUS.ASSIGNED){                            
                        } else 
                            throw new error.OrderException(`Sorry, cant rechedule on current state.`);

                        const lastAssignmentId = obj.assignmentId;
                        const lastTechnicianId = obj.technicianId;
                        const lastMitraId = obj.partyId;
                        
                        console.log('Rescheduling order');

                        const _dateOfService = new Date(newDateInLong);

                        const updatedOrderHeader ={
                            rescheduleCounter : obj.rescheduleCounter +1,
                            dateOfService : _dateOfService.customFormat("#YYYY##MM##DD#"),
                            timeOfService : _dateOfService.customFormat("#hh#:#mm#"),
                            bookingTimestamp : newDateInLong,
                            updatedBy : self.FB_CONSTANTS.USER_AS_COSTUMER.toString(),
                            updatedTimestamp: Date.now(),
                        }

                        const updatedOrderBucket = {
                            bookingTimestamp : newDateInLong,
                            updatedBy : self.FB_CONSTANTS.USER_AS_COSTUMER.toString(),
                            updatedTimestamp: updatedOrderHeader.updatedTimestamp,
                        }

                        return self.Order_SetStatus(customerId, orderId, self.BOOKINGSTATUS.CREATED, null, self.FB_CONSTANTS.USER_AS_COSTUMER.toString())
                                .then(result => {
                                
                                    self.Assignment_Delete(lastTechnicianId, lastAssignmentId);
                            
                                    self.TechnicianReg_deleteNotifyNewOrder(lastMitraId, lastTechnicianId, orderId);
                                                
                                    const _orderHeader = orderRef.update(updatedOrderHeader).then(() => {
                                    })
                                    .catch(err => console.error(err));

                                    const _orderBucket = self.Order_GetMitraPendingRef(mitraId, orderId)
                                                            .update(updatedOrderBucket)
                                                            .then(() => {
                                                            })
                                                            .catch(err => console.error(err));

                                    var promises = [_orderHeader, _orderBucket];            

                                    return Promise.all(promises)
                                        .then(data => {
                                            console.log(`Done updating status of order ${orderId}`);
                                            return true;
                                        });
                                });
                    })
            })

}

// bisa dipake oleh customer, server/mitra dan timeout
module.exports.cancelOrderBy = function(customerId, orderId, cancelStatus, cancelReason){
    
    const orderRef = self.Order_GetCustomerPendingRef(customerId, orderId);

    return self.IsRefExists(orderRef)
            .then(result => {
                if (!result){
                    return false;
                }

                return orderRef.once('value')
                    .then(snap => {
                        const obj = snap.val();

                        // 
                        // if (obj.statusDetailId === self.BOOKINGSTATUS.ASSIGNED
                            // || obj.statusDetailId === self.BOOKINGSTATUS.CREATED
                            // || obj.statusDetailId === self.BOOKINGSTATUS.UNHANDLED
                        // ){
                            // throw new error.OrderException(`Unable to Cancel. Status is ${obj.statusDetailId}`);
                        // }

                        if (obj.statusDetailId === self.BOOKINGSTATUS.CANCELLED_BY_CUSTOMER
                            || obj.statusDetailId === self.BOOKINGSTATUS.CANCELLED_BY_SERVER
                            || obj.statusDetailId === self.BOOKINGSTATUS.CANCELLED_BY_TIMEOUT
                        )
                            throw new error.OrderException(`Unable to Cancel. Status is ${obj.statusDetailId}`);
                        
                        console.log('Cancelling order');

                        var _updatedBy;

                        if (cancelStatus === self.BOOKINGSTATUS.CANCELLED_BY_CUSTOMER)
                            _updatedBy = self.FB_CONSTANTS.USER_AS_COSTUMER.toString();
                        else if (cancelStatus === self.BOOKINGSTATUS.CANCELLED_BY_SERVER)
                            _updatedBy = self.FB_CONSTANTS.USER_AS_MITRA.toString();
                        if (cancelStatus === self.BOOKINGSTATUS.CANCELLED_BY_TIMEOUT)
                            _updatedBy = self.FB_CONSTANTS.USER_AS_MITRA.toString();

                        return self.Order_SetStatus(customerId, orderId, cancelStatus, cancelReason, _updatedBy)
                                .then(result => {return result})
                                .catch(err => console.error(err));
                    })
            })

}

module.exports.IsPathExists = function(path){
    return self.IsRefExists(admin.database().ref(path));
}

module.exports.EncodeKey = function (raw){
    //return key.replace(/ /g,"_");
    // return encodeURI(key);
    // return btoa(key);
    return Buffer.from(raw).toString('base64');
}

module.exports.DecodeKey = function (key){
    return Buffer.from(key, 'base64').toString();
}
