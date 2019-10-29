
module.exports = {
    validateUser: async function(admin, idToken){
        return new Promise(async (resolve, reject) => {
            console.log('VALIDATE USER CALLED')
            admin.auth().verifyIdToken(idToken)
            .then(decodedToken => {
                console.log('REURNED TRUE')
              resolve(true)
          
            }).catch(error => {
                console.log('RETURNED FALSE')
              reject(false)
            });
        })
    }

}