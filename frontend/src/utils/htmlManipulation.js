export function cleanupEmptyParagraphs(body) {
  const allParagraphs = body.querySelectorAll('p')
  allParagraphs.forEach(p => {
    const text = p.textContent?.trim() || ''
    const hasOnlyBr = p.querySelectorAll('br').length === p.childNodes.length && p.childNodes.length > 0
    const isEmpty = p.classList.contains('is-empty') || (text === '' && hasOnlyBr)
    const hasMenuDots = text === '⋮' || text.includes('⋮')
    if (isEmpty || hasMenuDots) {
      p.remove()
    }
  })
}

export function removeMenuButtons(body) {
  const menuButtons = body.querySelectorAll('.image-menu-button, button[aria-label="Image options"]')
  menuButtons.forEach(btn => btn.remove())
}

export function findTitleParagraphs(body) {
  const allParagraphs = Array.from(body.querySelectorAll('p'))
  const titleParagraphs = []

  allParagraphs.forEach(p => {
    const dataType = p.getAttribute('data-type')
    const isInBlockquote = p.closest('blockquote') !== null

    const hasTaskLinkAnchor = p.querySelector('a[href*="task_id"]') || p.querySelector('a[href*="/mtp/project/"]')
    const text = p.textContent?.trim() || ''
    const hasTaskLinkText = text.includes('Liên kết công việc')
    const isTaskLink = p.querySelector('.node-task-link-section') ||
      p.querySelector('[data-node-section="task-link"]') ||
      p.classList.contains('node-task-link-section') ||
      p.getAttribute('data-node-section') === 'task-link' ||
      (hasTaskLinkText && hasTaskLinkAnchor) ||
      dataType === 'node-task-link'

    if (!isInBlockquote && !isTaskLink) {
      titleParagraphs.push(p)
      p.classList.add('node-title-section')
      p.setAttribute('data-node-section', 'title')
    }
  })

  return titleParagraphs
}

export function insertBadgeAfterTitle(body, badgeHtml, titleParagraphs) {
  const lastTitleParagraph = titleParagraphs.length > 0 ? titleParagraphs[titleParagraphs.length - 1] : null

  if (!lastTitleParagraph) return false

  const parser = new DOMParser()
  const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild

  const firstImage = body.querySelector('img, .image-wrapper-node, .image-wrapper')

  if (firstImage) {
    const imageWrapper = firstImage.closest('.image-wrapper-node, .image-wrapper')
    const imageContainer = imageWrapper || firstImage
    const imageParent = imageContainer.parentElement

    const imageParentIsTitleParagraph = titleParagraphs.includes(imageParent)

    let finalImageContainer = imageContainer
    if (imageContainer.classList.contains('image-wrapper-node') || imageContainer.classList.contains('image-wrapper')) {
      imageContainer.classList.add('node-image-section')
      imageContainer.setAttribute('data-node-section', 'image')
    } else if (imageContainer.tagName === 'IMG') {
      const doc = body.ownerDocument
      const imageSection = doc.createElement('section')
      imageSection.classList.add('node-image-section')
      imageSection.setAttribute('data-node-section', 'image')
      imageContainer.parentElement.insertBefore(imageSection, imageContainer)
      imageSection.appendChild(imageContainer)
      finalImageContainer = imageSection
    } else {
      imageContainer.classList.add('node-image-section')
      imageContainer.setAttribute('data-node-section', 'image')
    }

    const updatedImageParent = finalImageContainer.parentElement
    const updatedImageParentIsTitleParagraph = titleParagraphs.includes(updatedImageParent)

    if (updatedImageParentIsTitleParagraph) {
      const imageClone = finalImageContainer.cloneNode(true)
      finalImageContainer.remove()
      body.insertBefore(badgeElement, lastTitleParagraph.nextSibling)
      body.insertBefore(imageClone, badgeElement.nextSibling)
    } else {
      finalImageContainer.parentElement.insertBefore(badgeElement, finalImageContainer)
    }
  } else {
    if (lastTitleParagraph.nextSibling) {
      body.insertBefore(badgeElement, lastTitleParagraph.nextSibling)
    } else {
      body.appendChild(badgeElement)
    }
  }

  return true
}

export function markDescriptionParagraphs(body) {
  const remainingParagraphs = body.querySelectorAll('p:not(.node-title-section)')
  remainingParagraphs.forEach(p => {
    if (!p.classList.contains('node-description-section')) {
      p.classList.add('node-description-section')
      p.setAttribute('data-node-section', 'description')
    }
  })
}

export function parseAndInsertBadge(html, badgeHtml, fallbackTitle = 'Nhánh mới') {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const body = doc.body

    cleanupEmptyParagraphs(body)
    removeMenuButtons(body)

    const titleParagraphs = findTitleParagraphs(body)

    if (titleParagraphs.length > 0) {
      insertBadgeAfterTitle(body, badgeHtml, titleParagraphs)
    } else {
      const titleParagraph = doc.createElement('p')
      titleParagraph.textContent = fallbackTitle
      body.appendChild(titleParagraph)

      const badgeElement = parser.parseFromString(badgeHtml, 'text/html').body.firstChild
      body.appendChild(badgeElement)
    }

    markDescriptionParagraphs(body)

    return body.innerHTML
  } catch (err) {
    console.error('Error parsing HTML for badge insertion:', err)
    return `${html}${badgeHtml}`
  }
}

export function removeBadgeFromHTML(html) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const body = doc.body

    const taskLinkSections = body.querySelectorAll('.node-task-link-section, [data-node-section="task-link"]')
    taskLinkSections.forEach(section => section.remove())

    const taskLinkParagraphs = body.querySelectorAll('p')
    taskLinkParagraphs.forEach(p => {
      const hasTaskLink = p.querySelector('a[href*="task_id"]') || p.querySelector('a[href*="/mtp/project/"]')
      const text = p.textContent?.trim() || ''
      if (text.includes('Liên kết công việc') && hasTaskLink) {
        p.remove()
      }
    })

    return body.innerHTML
  } catch (err) {
    console.error('Error removing badge from HTML:', err)
    return html
  }
}

