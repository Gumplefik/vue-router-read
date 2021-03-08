// 继承，拷贝式继承，相对少差一次原型链，性能会好一点
// 将b中的属性拷贝到a
export function extend (a, b) {
  for (const key in b) {
    a[key] = b[key]
  }
  return a
}
