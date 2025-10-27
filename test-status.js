// Test logic
const status = 502

if (status >= 200 && status < 400) {
  console.log('SUCCESS - WRONG!')
} else {
  console.log('ERROR - CORRECT!')
}

console.log('Status:', status)
console.log('status >= 200:', status >= 200)
console.log('status < 400:', status < 400)
console.log('Combined:', status >= 200 && status < 400)
