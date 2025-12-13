import { Node } from "@tiptap/core"

export const ImageRow = Node.create({
  name: "imageRow",

  // ======================
  // CẤU TRÚC NODE
  // ======================
  group: "block",
  content: "image*",
  selectable: true,
  isolating: true, // tránh text dính vào row

  // ======================
  // HTML ↔ PM
  // ======================
  parseHTML() {
    return [
      {
        tag: 'div[data-type="image-row"]',
      },
    ]
  },

  renderHTML() {
    return [
      "div",
      {
        "data-type": "image-row",
        class: "image-row",
      },
      0, // 👈 render content (image nodes)
    ]
  },
  // ======================
  // COMMANDS
  // ======================
  addCommands() {
    return {
      insertImageRow:
        (images) =>
        ({ state, dispatch }) => {
          const { doc, tr, schema } = state
          const imageType = schema.nodes.image
          const rowType = schema.nodes.imageRow

          const MAX_PER_ROW = 3

          let lastRow = null
          let lastRowPos = null

          // 🔍 tìm image-row cuối cùng
          doc.descendants((node, pos) => {
            if (node.type === rowType) {
              lastRow = node
              lastRowPos = pos
            }
          })

          // helper: tạo image nodes
          const createImageNodes = (srcs) =>
            srcs.map((src) => imageType.create({ src }))

          // ======================
          // 1. GỘP VÀO ROW CUỐI NẾU CÒN CHỖ
          // ======================
          if (lastRow) {
            const currentCount = lastRow.childCount

            if (currentCount < MAX_PER_ROW) {
              const remain = MAX_PER_ROW - currentCount
              const toAppend = images.slice(0, remain)
              const leftover = images.slice(remain)

              if (toAppend.length) {
                const newContent = [
                  ...lastRow.content.content,
                  ...createImageNodes(toAppend),
                ]

                tr.replaceWith(
                  lastRowPos + 1,
                  lastRowPos + lastRow.nodeSize - 1,
                  newContent
                )
              }

              // nếu còn dư → tạo row mới
              if (leftover.length) {
                tr.insert(
                  lastRowPos + lastRow.nodeSize,
                  rowType.create({}, createImageNodes(leftover))
                )
              }

              dispatch(tr.scrollIntoView())
              return true
            }
          }

          // ======================
          // 2. KHÔNG CÓ ROW / ROW ĐẦY → TẠO ROW MỚI
          // ======================
          const { $from } = tr.selection

          const insertPos = $from.end($from.depth)

          tr.insert(insertPos, rowType.create({}, createImageNodes(images)))

          dispatch(tr.scrollIntoView())
          return true
        },
    }
  },
})
