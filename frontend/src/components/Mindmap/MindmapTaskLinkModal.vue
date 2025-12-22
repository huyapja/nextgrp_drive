<template>
  <div v-if="visible" class="task-link-overlay" @click.self="$emit('close')">
    <div class="task-link-modal">
      <div class="task-link-header">
        <div class="min-w-[0px]">
          <p class="task-link-title">Liên kết công việc cho nhánh</p>
          <p class="task-link-subtitle truncate">{{ nodeTitle }}</p>
        </div>
        <button class="task-link-close" @click="$emit('close')">✕</button>
      </div>

      <div class="task-link-tabs">
        <button
          :class="['task-link-tab', { active: mode === 'existing' }]"
          @click="$emit('update:mode', 'existing')"
        >
          Chọn công việc có sẵn
        </button>
        <button
          :class="['task-link-tab', { active: mode === 'from-node' }]"
          @click="$emit('update:mode', 'from-node')"
        >
          Tạo mới công việc
        </button>
      </div>

      <div class="task-link-main">
        <template v-if="mode === 'existing'">
          <div class="task-link-body task-list-box">
            <div class="task-list-content">
            <div class="task-filter-row">
              <input
                v-model="searchModel"
                class="task-link-search"
                type="text"
                placeholder="Tìm tên công việc hoặc người thực hiện..."
              />
              <div class="task-project-select" ref="projectSelectRef">
                <button type="button" class="project-select-trigger" @click="toggleProjectDropdown">
                  <span class="project-select-label">{{ currentProjectLabel }}</span>
                  <span
                    class="project-select-caret"
                    :class="{ open: projectDropdownOpen }"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                </button>
                <div v-if="projectDropdownOpen" class="overflow-hidden rounded-md">
                  <div class="project-select-menu overflow-hidden rounded-md">
                    <div
                      class="project-select-item"
                      :class="{ active: projectFilter === 'all' }"
                      @click="selectProject('all')"
                    >
                      Tất cả dự án
                    </div>
                    <div
                      v-for="p in projectOptionsComputed"
                      :key="p.value"
                      class="project-select-item"
                      :class="{ active: projectFilter === p.value }"
                      @click="selectProject(p.value)"
                    >
                      {{ p.label }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
  
              <div class="task-list mt-2">
                <div
                  v-for="task in tasks"
                  :key="task.id"
                  class="task-item"
                  :class="{ selected: selectedTaskId === task.id }"
                  @click="$emit('update:selectedTaskId', task.id)"
                >
                  <label class="task-item-radio">
                    <input type="radio" :value="task.id" :checked="selectedTaskId === task.id" />
                  </label>
                  <div class="task-item-info">
                    <div class="task-item-title">{{ task.task_name }}</div>
                    <div class="task-item-meta">
                      <span class="task-code" v-if="task.project_name || task.project">{{ task.project_name || task.project }}</span>
                      <span class="task-assignee">
                        {{ task.office_name || task.assignee }}
                      </span>
                      <span class="task-status" :class="getStatusClass(task.status)">{{ task.status }}</span>
                    </div>
                  </div>
                </div>
  
                <div v-if="!tasks || tasks.length === 0" class="task-empty">Không tìm thấy công việc phù hợp.</div>
              </div>
            </div>
            <div class="flex flex-row justify-end w-full">
              <div class="task-pagination">
                <button class="task-page-btn" :disabled="page <= 1" @click="$emit('update:page', page - 1)">‹</button>
              <div class="task-page-numbers">
                  <button
                  v-for="(p, idx) in pageButtons"
                  :key="idx"
                  v-if="p !== '…'"
                  class="task-page-btn"
                  :class="{ active: p === page }"
                  @click="$emit('update:page', p)"
                  >
                    {{ p }}
                  </button>
                <span
                  v-else
                  class="task-page-ellipsis"
                >…</span>
                </div>
                <button class="task-page-btn" :disabled="page >= totalPages" @click="$emit('update:page', page + 1)">›</button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="task-link-body flex-1 overflow-y-auto">
            <!-- Task Info Section (Project + Task Name) -->
            <div class="task-new-info-section">
              <!-- Project Selection -->
              <div class="task-new-project-section">
                <div class="task-new-project-selector" ref="newTaskProjectRef">
                  <button
                    type="button"
                    class="task-new-project-trigger"
                    :class="{ error: formErrors.project }"
                    @click="toggleNewTaskProject"
                  >
                    <span :class="{ 'text-gray-400 italic': !newTaskFormData.project }">
                      {{ newTaskFormData.project?.label || 'Chọn dự án*' }}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <div v-if="newTaskProjectOpen" class="task-new-project-dropdown">
                    <div class="task-new-project-search">
                      <input
                        v-model="newTaskProjectSearch"
                        type="text"
                        placeholder="Tìm kiếm dự án..."
                        class="task-new-project-search-input"
                      />
                    </div>
                    <div class="task-new-project-list">
                      <div v-if="loadingProjects" class="task-new-project-loading">
                        <svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle>
                          <path fill="currentColor" class="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Đang tải dự án...</span>
                      </div>
                      <div
                        v-else
                        v-for="project in filteredNewTaskProjects"
                        :key="project.value"
                        class="task-new-project-item"
                        :class="{ active: newTaskFormData.project?.value === project.value }"
                        @click="selectNewTaskProject(project)"
                      >
                        {{ project.label }}
                      </div>
                      <div v-if="!loadingProjects && filteredNewTaskProjects.length === 0" class="task-new-project-empty">
                        Không tìm thấy dự án
                      </div>
                    </div>
                  </div>
                </div>
                <p v-if="formErrors.project" class="task-form-error">{{ formErrors.project }}</p>
              </div>

              <!-- Task Name Input -->
              <div class="task-new-name-section">
                <textarea
                  ref="taskNameTextarea"
                  v-model="newTaskFormData.task_name"
                  rows="1"
                  placeholder="Tên công việc *"
                  class="task-new-name-input"
                  :class="{ error: formErrors.task_name || maxLengthError }"
                  @input="handleTaskNameInput"
                />
                <p v-if="maxLengthError" class="task-form-error">{{ maxLengthError }}</p>
                <p v-if="formErrors.task_name" class="task-form-error">{{ formErrors.task_name }}</p>
              </div>
            </div>

            <!-- Basic Info Section (5 fields) -->
            <div class="task-new-basic-info">
              <div class="task-new-form-grid">
                <!-- Người thực hiện -->
                <div class="task-new-form-field">
                  <label class="task-new-form-label">
                    Người thực hiện <span class="required">*</span>
                  </label>
                  <div class="task-form-select-wrapper" ref="assigneeSelectRef">
                    <button
                      type="button"
                      class="task-form-select-trigger"
                      @click="toggleAssigneeSelect"
                    >
                      <span class="task-form-select-value" :class="{ placeholder: !getDisplayValue(newTaskFormData.name_assign_to) }">
                        {{ getDisplayValue(newTaskFormData.name_assign_to) || 'Chưa chọn người thực hiện' }}
                      </span>
                      <span class="task-form-select-caret" :class="{ open: assigneeSelectOpen }">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                          <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.6"/>
                        </svg>
                      </span>
                    </button>
                    <div v-if="assigneeSelectOpen" class="task-form-select-menu">
                      <div v-if="!newTaskFormData.project && userOptions.length === 0" class="task-form-select-empty">
                        Vui lòng chọn dự án trước
                      </div>
                      <div v-else-if="loadingUserOptions && userOptions.length === 0" class="task-form-select-loading">
                        <div class="task-form-select-spinner"></div>
                        <span>Đang tải...</span>
                      </div>
                      <template v-else-if="userOptions.length > 0">
                        <div
                          v-for="option in userOptions"
                          :key="option.value"
                          class="task-form-select-item"
                          :class="{ active: newTaskFormData.name_assign_to?.value === option.value }"
                          @click="selectAssigneeOption(option)"
                        >
                          <div v-if="option.avatar" class="task-form-select-avatar">
                            <img :src="option.avatar" :alt="option.label" />
                          </div>
                          <div v-else class="task-form-select-avatar-placeholder">
                            {{ option.label?.charAt(0) }}
                          </div>
                          {{ option.label }}
                        </div>
                        <div v-if="!newTaskFormData.project" class="task-form-select-hint">
                          <small style="color: #6b7280; padding: 8px 12px; display: block; font-size: 12px;">
                            Chọn dự án để xem thêm thành viên
                          </small>
                        </div>
                      </template>
                      <div v-else class="task-form-select-empty">
                        Không có thành viên trong dự án này
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Thời hạn -->
                <div class="task-new-form-field">
                  <label class="task-new-form-label">Thời hạn</label>
                  <input
                    v-model="newTaskFormData.duration"
                    type="date"
                    class="task-new-form-input"
                    :min="minDate"
                    :max="maxDate"
                    @change="validateDuration"
                    />
                  <div v-if="durationError" class="task-new-form-error">{{ durationError }}</div>
                </div>

                <!-- Người phê duyệt -->
                <div class="task-new-form-field">
                  <label class="task-new-form-label">
                    Người phê duyệt
                    <span v-if="newTaskFormData.project?.need_approve" class="required">*</span>
                  </label>
                  <div class="task-form-select-wrapper" ref="approverSelectRef">
                    <button
                      type="button"
                      class="task-form-select-trigger"
                      @click="toggleApproverSelect"
                    >
                      <span class="task-form-select-value" :class="{ placeholder: !getDisplayValue(newTaskFormData.assigned_by) }">
                        {{ getDisplayValue(newTaskFormData.assigned_by) || 'Chưa chọn người phê duyệt' }}
                      </span>
                      <span class="task-form-select-caret" :class="{ open: approverSelectOpen }">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                          <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.6"/>
                        </svg>
                      </span>
                    </button>
                    <div v-if="approverSelectOpen" class="task-form-select-menu">
                      <div v-if="!newTaskFormData.project" class="task-form-select-empty">
                        Vui lòng chọn dự án trước
                      </div>
                      <div v-else-if="loadingUserOptions" class="task-form-select-loading">
                        <div class="task-form-select-spinner"></div>
                        <span>Đang tải...</span>
                      </div>
                      <template v-else>
                        <div
                          v-for="option in approverOptions"
                          :key="option.value"
                          class="task-form-select-item"
                          :class="{ active: newTaskFormData.assigned_by?.value === option.value }"
                          @click="selectApproverOption(option)"
                        >
                          <div v-if="option.avatar" class="task-form-select-avatar">
                            <img :src="option.avatar" :alt="option.label" />
                          </div>
                          <div v-else class="task-form-select-avatar-placeholder">
                            {{ option.label?.charAt(0) }}
                          </div>
                          {{ option.label }}
                        </div>
                        <div v-if="approverOptions.length === 0" class="task-form-select-empty">
                          Không có người phê duyệt
                        </div>
                      </template>
                    </div>
                  </div>
                </div>

                <!-- Độ ưu tiên -->
                <div class="task-new-form-field">
                  <label class="task-new-form-label">Độ ưu tiên</label>
                  <div class="task-form-select-wrapper" ref="prioritySelectRef">
                    <button
                      type="button"
                      class="task-form-select-trigger"
                      @click="togglePrioritySelect"
                    >
                      <span class="task-form-select-value" :class="{ placeholder: !getDisplayValue(newTaskFormData.priority) }">
                        {{ getDisplayValue(newTaskFormData.priority) || 'Chưa chọn độ ưu tiên' }}
                      </span>
                      <span class="task-form-select-caret" :class="{ open: prioritySelectOpen }">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                          <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.6"/>
                        </svg>
                      </span>
                    </button>
                    <div v-if="prioritySelectOpen" class="task-form-select-menu">
                      <div
                        v-for="option in priorityOptions"
                        :key="option.value"
                        class="task-form-select-item"
                        :class="{ active: newTaskFormData.priority?.value === option.value }"
                        @click="selectPriorityOption(option)"
                      >
                        {{ option.label }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Nhóm công việc -->
                <div class="task-new-form-field">
                  <label class="task-new-form-label">Nhóm công việc</label>
                  <div class="task-form-select-wrapper" ref="sectionSelectRef">
                    <button
                      type="button"
                      class="task-form-select-trigger"
                      @click="toggleSectionSelect"
                    >
                      <span class="task-form-select-value" :class="{ placeholder: !getDisplayValue(newTaskFormData.section_title) }">
                        {{ getDisplayValue(newTaskFormData.section_title) || 'Chưa phân nhóm' }}
                      </span>
                      <span class="task-form-select-caret" :class="{ open: sectionSelectOpen }">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                          <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.6"/>
                        </svg>
                      </span>
                    </button>
                    <div v-if="sectionSelectOpen" class="task-form-select-menu">
                      <div v-if="loadingSectionOptions" class="task-form-select-loading">
                        <div class="task-form-select-spinner"></div>
                        <span>Đang tải...</span>
                      </div>
                      <template v-else-if="sectionOptions.length > 0">
                        <div
                          v-for="option in sectionOptions"
                          :key="option.value"
                          class="task-form-select-item"
                          :class="{ active: newTaskFormData.section_title?.value === option.value || newTaskFormData.section_title === option.value }"
                          @click="selectSectionOption(option)"
                        >
                          {{ option.label }}
                        </div>
                      </template>
                      <div v-else class="task-form-select-empty">
                        Không có nhóm công việc
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Description Section -->
            <div class="task-new-description-section">
              <label class="task-new-form-label">Mô tả</label>
              <div class="task-new-description-editor">
                <!-- Toolbar -->
                <div class="task-new-editor-toolbar">
                  <button
                    type="button"
                    class="task-new-toolbar-btn"
                    :class="{ active: isBold }"
                    @click="toggleBold"
                    title="Bold"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="task-new-toolbar-btn"
                    :class="{ active: isItalic }"
                    @click="toggleItalic"
                    title="Italic"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="m19 4-9 16"/>
                      <path d="m15 4-9 16"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="task-new-toolbar-btn"
                    @click="toggleBulletList"
                    title="Bullet List"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <line x1="8" y1="6" x2="21" y2="6"/>
                      <line x1="8" y1="12" x2="21" y2="12"/>
                      <line x1="8" y1="18" x2="21" y2="18"/>
                      <line x1="3" y1="6" x2="3.01" y2="6"/>
                      <line x1="3" y1="12" x2="3.01" y2="12"/>
                      <line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="task-new-toolbar-btn"
                    @click="toggleNumberedList"
                    title="Numbered List"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <line x1="10" y1="6" x2="21" y2="6"/>
                      <line x1="10" y1="12" x2="21" y2="12"/>
                      <line x1="10" y1="18" x2="21" y2="18"/>
                      <path d="M4 6h1v4"/>
                      <path d="M4 10h2"/>
                      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1.5"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="task-new-toolbar-btn"
                    @click="toggleBlockquote"
                    title="Quote"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
                      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="task-new-toolbar-btn"
                    @click="showLinkDialog"
                    title="Insert Link"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="task-new-toolbar-btn"
                    @click="triggerFileUpload"
                    title="Attach File"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.64 16.2a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
                    </svg>
                  </button>
                  <input
                    ref="fileInputRef"
                    type="file"
                    multiple
                    @change="handleFileSelect"
                    style="display: none"
                  />
                </div>
                
                <!-- Editor Content -->
                <div
                  ref="descriptionEditorRef"
                  class="task-new-description-content"
                  contenteditable="true"
                  @input="handleDescriptionInput"
                  @keydown="handleEditorKeydown"
                  data-placeholder="Nhập mô tả công việc..."
                />
                
                <!-- Files Display -->
                <div v-if="newTaskFormData.files && newTaskFormData.files.length > 0" class="task-new-attached-files">
                  <div class="task-new-files-header">File đính kèm ({{ newTaskFormData.files.length }})</div>
                  <div class="task-new-files-list">
                    <div
                      v-for="(file, index) in newTaskFormData.files"
                      :key="index"
                      class="task-new-file-item"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.64 16.2a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
                      </svg>
                      <span class="task-new-file-name">{{ file.name }}</span>
                      <button type="button" class="task-new-file-remove" @click="removeFile(index)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Collaborators Section -->
            <div class="task-new-collaborators-section">
              <div class="task-new-collaborators-header">
                <span class="task-new-collaborators-label">Người phối hợp:</span>
                <div class="task-new-collaborators-list">
                  <div
                    v-for="collab in newTaskFormData.collaborator"
                    :key="collab.id"
                    class="task-new-collaborator-item-wrapper"
                  >
                    <div class="task-new-collaborator-item task-new-collaborator-tooltip-trigger">
                      <div class="task-new-collaborator-avatar">
                        <img v-if="collab.avatar" :src="collab.avatar" :alt="collab.name" />
                        <div v-else class="task-new-collaborator-avatar-placeholder">
                          {{ collab.name?.charAt(0) }}
                        </div>
                      </div>
                      <button
                        v-if="collab.isRemove"
                        type="button"
                        class="task-new-collaborator-remove"
                        @click.stop="removeCollaborator(collab.id)"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                      <!-- Tooltip -->
                      <div class="task-new-collaborator-tooltip">
                        <div class="task-new-collaborator-tooltip-content">
                          <div class="task-new-collaborator-tooltip-avatar">
                            <img v-if="collab.avatar" :src="collab.avatar" :alt="collab.name" />
                            <div v-else class="task-new-collaborator-tooltip-avatar-placeholder">
                              {{ collab.name?.charAt(0) }}
                            </div>
                          </div>
                          <div class="task-new-collaborator-tooltip-info">
                            <div class="task-new-collaborator-tooltip-name">{{ collab.name }}</div>
                            <div class="task-new-collaborator-tooltip-role">Nhân viên</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="task-new-collaborator-add-wrapper">
                    <button
                      type="button"
                      class="task-new-collaborator-add task-new-collaborator-add-tooltip-trigger"
                      @click.stop="toggleCollaboratorDropdown"
                      title="Thêm người phối hợp"
                    >
                      +
                      <!-- Tooltip for add button -->
                      <div class="task-new-collaborator-add-tooltip">
                        Thêm người phối hợp
                      </div>
                    </button>
                  </div>
                  <div v-if="collaboratorDropdownOpen" ref="collaboratorDropdownRef" class="task-new-collaborator-dropdown">
                    <div class="task-new-collaborator-dropdown-header">
                      <div class="task-new-collaborator-dropdown-header-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <line x1="19" y1="8" x2="19" y2="14"/>
                          <line x1="22" y1="11" x2="16" y2="11"/>
                        </svg>
                      </div>
                      <div class="task-new-collaborator-dropdown-header-text">
                        <h3>Thêm người phối hợp</h3>
                        <p>Chọn từ danh sách thành viên dự án</p>
                      </div>
                    </div>
                    <div class="task-new-collaborator-search">
                      <div class="task-new-collaborator-search-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="11" cy="11" r="8"/>
                          <path d="m21 21-4.35-4.35"/>
                        </svg>
                      </div>
                      <input
                        v-model="collaboratorSearch"
                        type="text"
                        placeholder="Tìm kiếm theo tên, email hoặc phòng"
                        class="task-new-collaborator-search-input"
                      />
                    </div>
                    <div class="task-new-collaborator-options">
                      <div
                        v-for="user in filteredCollaboratorOptions"
                        :key="user.value"
                        class="task-new-collaborator-option"
                        @click.stop="addCollaborator(user)"
                      >
                        <div class="task-new-collaborator-option-avatar">
                          <img v-if="user.avatar" :src="user.avatar" :alt="user.label" />
                          <div v-else class="task-new-collaborator-option-avatar-placeholder">
                            {{ user.label?.charAt(0) }}
                          </div>
                        </div>
                        <div class="task-new-collaborator-option-info">
                          <div class="task-new-collaborator-option-name">{{ user.label }}</div>
                          <div class="task-new-collaborator-option-email">{{ user.email }}</div>
                          <div class="task-new-collaborator-option-department">{{ user.department }}</div>
                        </div>
                      </div>
                      <div v-if="filteredCollaboratorOptions.length === 0" class="task-new-collaborator-empty">
                        {{ collaboratorSearch ? 'Không tìm thấy thành viên phù hợp' : 'Không có thành viên khả dụng' }}
                      </div>
                    </div>
                    <!-- Footer -->
                    <div class="task-new-collaborator-dropdown-footer">
                      <p>{{ filteredCollaboratorOptions.length }} thành viên khả dụng</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="task-link-footer" v-if="mode === 'existing'">
        <button class="task-link-btn cancel" @click="$emit('close')">Hủy</button>
        <button
          class="task-link-btn primary"
          :disabled="!selectedTaskId"
          @click="$emit('confirm')"
        >
          Liên kết
        </button>
      </div>
      <div v-else class="task-link-footer">
        <button class="task-link-btn cancel" @click="$emit('close')">Hủy</button>
        <button
          class="task-link-btn primary"
          :disabled="!isFormValid"
          @click="handleCreateTask"
        >
          Tạo công việc
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { call } from 'frappe-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  visible: Boolean,
  nodeTitle: {
    type: String,
    default: ''
  },
  mode: {
    type: String,
    default: 'existing'
  },
  search: {
    type: String,
    default: ''
  },
  tasks: {
    type: Array,
    default: () => []
  },
  selectedTaskId: {
    type: String,
    default: null
  },
  linkUrl: {
    type: String,
    default: ''
  },
  projectFilter: {
    type: String,
    default: 'all'
  },
  projectOptions: {
    type: Array,
    default: () => []
  },
  page: {
    type: Number,
    default: 1
  },
  totalPages: {
    type: Number,
    default: 1
  },
  nodeCreator: {
    type: Object,
    default: null
  },
  mindmapTitle: {
    type: String,
    default: ''
  },
  nodeLink: {
    type: String,
    default: ''
  },
  userOptions: {
    type: Array,
    default: () => []
  },
  nodeOwner: {
    type: String,
    default: ''
  },
  team: {
    type: String,
    default: ''
  },
  mindmapId: {
    type: String,
    default: ''
  },
  nodeId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'close',
  'confirm',
  'createTask',
  'update:mode',
  'update:search',
  'update:selectedTaskId',
  'update:linkUrl',
  'update:projectFilter',
  'update:page'
])

const searchModel = computed({
  get: () => props.search,
  set: (val) => emit('update:search', val)
})

const pageButtons = computed(() => {
  const total = Math.max(1, props.totalPages || 1)
  const current = Math.min(Math.max(1, props.page || 1), total)
  const pages = []

  const add = (val) => pages.push(val)

  if (total <= 7) {
    for (let i = 1; i <= total; i++) add(i)
    return pages
  }

  add(1)

  const windowStart = Math.max(2, current - 1)
  const windowEnd = Math.min(total - 1, current + 1)

  if (windowStart > 2) add('…')

  for (let i = windowStart; i <= windowEnd; i++) add(i)

  if (windowEnd < total - 1) add('…')

  add(total)

  return pages
})

const projectDropdownOpen = ref(false)
const projectSelectRef = ref(null)

const projectOptionsComputed = computed(() => {
  return (props.projectOptions || []).map((p) =>
    typeof p === 'string' ? { value: p, label: p } : p
  )
})

const currentProjectLabel = computed(() => {
  const found = projectOptionsComputed.value.find((p) => p.value === props.projectFilter)
  return found?.label || 'Tất cả dự án'
})

const toggleProjectDropdown = () => {
  projectDropdownOpen.value = !projectDropdownOpen.value
}

const selectProject = (val) => {
  projectDropdownOpen.value = false
  emit('update:projectFilter', val)
}

const handleClickOutside = (e) => {
  if (!projectDropdownOpen.value) return
  const el = projectSelectRef.value
  if (el && !el.contains(e.target)) {
    projectDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

const getStatusClass = (status) => {
  const statusLower = (status || '').toLowerCase()
  console.log('statusLower', statusLower);
  
  if (statusLower.includes('hoàn thành') || statusLower.includes('completed')) {
    return 'status-green'
  } else if (statusLower.includes('thực hiện') || statusLower.includes('in progress')) {
    return 'status-blue'
  } else if (statusLower.includes('tạm dừng') || statusLower.includes('paused')) {
    return 'status-yellow'
  } else if (statusLower.includes('huỷ') || statusLower.includes('hủy') || statusLower.includes('huy') || statusLower.includes('cancel')) {
    return 'status-red'
  } else if (statusLower.includes('chờ phê duyệt') || statusLower.includes('pending approval')) {
    return 'status-purple'
  } else if (statusLower.includes('được tạo') || statusLower.includes('to do')) {
    return 'status-gray'
  }
  return 'status-gray'
}

// New Task Form Data
const newTaskFormData = ref({
  task_name: '',
  project: null,
  description: '',
  name_assign_to: null,
  assigned_by: null,
  priority: { label: 'Trung bình', value: 'Medium' },
  duration: null,
  section_title: null,
  collaborator: [],
  files: []
})

const formErrors = ref({})
const maxLengthError = ref('')
const durationError = ref('')

// New Task Project Selector
const newTaskProjectOpen = ref(false)
const newTaskProjectRef = ref(null)
const newTaskProjectSearch = ref('')

// Form Field Selects
const assigneeSelectOpen = ref(false)
const assigneeSelectRef = ref(null)
const approverSelectOpen = ref(false)
const approverSelectRef = ref(null)
const prioritySelectOpen = ref(false)
const prioritySelectRef = ref(null)
const sectionSelectOpen = ref(false)
const sectionSelectRef = ref(null)

// Description Editor
const taskNameTextarea = ref(null)
const descriptionEditorRef = ref(null)
const fileInputRef = ref(null)
const isBold = ref(false)
const isItalic = ref(false)

// Collaborators
const collaboratorDropdownOpen = ref(false)
const collaboratorDropdownRef = ref(null)
const collaboratorSearch = ref('')

// Options (these should come from props or API calls)
const userOptions = ref([])
const loadingUserOptions = ref(false)

// Cache để tránh gọi API nhiều lần cho cùng một owner
const ownerInfoCache = ref({})

// Fetch owner info from email (must be declared before addOwnerToUserOptions)
const fetchOwnerInfo = async (ownerEmail) => {
  if (!ownerEmail) {
    console.log('fetchOwnerInfo: No ownerEmail provided')
    return null
  }
  
  // Kiểm tra cache trước
  if (ownerInfoCache.value[ownerEmail]) {
    console.log('fetchOwnerInfo: Using cached data for:', ownerEmail)
    return ownerInfoCache.value[ownerEmail]
  }
  
  try {
    console.log('fetchOwnerInfo: Fetching User info for:', ownerEmail)
    // Get User info
    const userRes = await call('frappe.client.get_value', {
      doctype: 'User',
      filters: { name: ownerEmail },
      fieldname: ['name', 'full_name', 'user_image', 'email']
    })
    
    console.log('fetchOwnerInfo: User response:', userRes)
    const user = userRes
    if (!user) {
      console.warn('fetchOwnerInfo: User not found for:', ownerEmail)
      // Return basic info even if User not found
      const fallback = {
        user: ownerEmail,
        full_name: ownerEmail,
        user_image: '',
        email: ownerEmail,
        mobile_no: '',
        id: ownerEmail
      }
      ownerInfoCache.value[ownerEmail] = fallback
      return fallback
    }
    
    console.log('fetchOwnerInfo: User found:', user)
    
    // Get Officer info from user email - this is critical for assign_to
    let officerId = null
    try {
      const officerRes = await call('frappe.client.get_value', {
        doctype: 'Officer',
        filters: { user: ownerEmail },
        fieldname: ['name']
      })
      if (officerRes && officerRes.name) {
        officerId = officerRes.name
        console.log('fetchOwnerInfo: Officer ID found:', officerId)
      } else {
        console.warn('fetchOwnerInfo: Officer not found for user:', ownerEmail)
      }
    } catch (officerError) {
      console.warn('fetchOwnerInfo: Error fetching Officer:', officerError)
    }
    
    // Return info with officer_id (Officer name/ID) as the primary ID for assign_to
    const result = {
      user: user.name || ownerEmail,
      full_name: user.full_name || user.name || ownerEmail,
      user_image: user.user_image || '',
      email: user.email || ownerEmail,
      mobile_no: user.mobile_no || '',
      officer_id: officerId, // This is the Officer name/ID that should be used for assign_to
      id: officerId || user.mobile_no || user.name || ownerEmail // Fallback chain
    }
    
    // Lưu vào cache
    ownerInfoCache.value[ownerEmail] = result
    console.log('fetchOwnerInfo: Returning result and cached:', result)
    return result
  } catch (error) {
    console.error('Failed to fetch owner info:', error)
    // Return basic info if API fails - still allow setting assignee
    const fallback = {
      user: ownerEmail,
      full_name: ownerEmail,
      user_image: '',
      email: ownerEmail,
      mobile_no: '',
      id: ownerEmail
    }
    // Lưu fallback vào cache để không gọi lại API
    ownerInfoCache.value[ownerEmail] = fallback
    console.log('fetchOwnerInfo: Returning fallback and cached:', fallback)
    return fallback
  }
}

// Function to add owner to userOptions
const addOwnerToUserOptions = async () => {
  if (props.mode === 'from-node' && props.nodeOwner) {
    const ownerInfo = await fetchOwnerInfo(props.nodeOwner)
    if (ownerInfo) {
      const ownerEmail = ownerInfo.email || ownerInfo.user
      // Use officer_id (Officer name) as value, fallback to other IDs
      const ownerValue = ownerInfo.officer_id || ownerInfo.mobile_no || ownerInfo.id || ownerInfo.user
      
      // Check if owner already exists in options
      const ownerExists = userOptions.value.some(user => 
        user.email === ownerEmail || 
        user.value === ownerValue ||
        user.value === ownerInfo.officer_id
      )
      
      if (!ownerExists && ownerValue) {
        const ownerOption = {
          label: ownerInfo.full_name || ownerInfo.user,
          value: ownerValue, // This should be Officer name/ID
          avatar: ownerInfo.user_image || '',
          position: '',
          department: '',
          email: ownerEmail
        }
        // Add owner at the beginning of the list
        userOptions.value.unshift(ownerOption)
        console.log('Added owner to userOptions (initial):', ownerOption)
      }
    }
  }
}

// Use userOptions from props if provided, otherwise fetch from API
watch(() => props.userOptions, (newOptions) => {
  if (newOptions && newOptions.length > 0) {
    userOptions.value = newOptions
    // Add owner if in from-node mode
    addOwnerToUserOptions()
  }
}, { immediate: true })

// Watch mode and nodeOwner to add owner to options immediately
watch(() => [props.mode, props.nodeOwner], async ([mode, nodeOwner]) => {
  if (mode === 'from-node' && nodeOwner) {
    await addOwnerToUserOptions()
  }
}, { immediate: true })
const approverOptions = computed(() => {
  return userOptions.value.filter(user => 
    user.position === 'Quản Trị Dự Án' || user.position === 'Chủ Dự Án'
  )
})
const priorityOptions = ref([
  { label: 'Thấp', value: 'Low' },
  { label: 'Trung bình', value: 'Medium' },
  { label: 'Cao', value: 'High' }
  // { label: 'Khẩn cấp', value: 'Critical' } // Đã bỏ option này
])
const sectionOptions = ref([
  { label: 'Chưa phân nhóm', value: '_empty' }
])
const loadingSectionOptions = ref(false)

// Fetch user options from API
const fetchUserOptions = async (projectId) => {
  if (!projectId) {
    userOptions.value = []
    // Still add owner to options if in from-node mode
    if (props.mode === 'from-node' && props.nodeOwner) {
      const ownerInfo = await fetchOwnerInfo(props.nodeOwner)
      if (ownerInfo) {
        // Use officer_id (Officer name) as value, fallback to other IDs
        const ownerValue = ownerInfo.officer_id || ownerInfo.mobile_no || ownerInfo.id || ownerInfo.user
        if (ownerValue) {
          const ownerOption = {
            label: ownerInfo.full_name || ownerInfo.user,
            value: ownerValue, // This should be Officer name/ID
            avatar: ownerInfo.user_image || '',
            position: '',
            department: '',
            email: ownerInfo.email || ownerInfo.user
          }
          userOptions.value = [ownerOption]
        }
      }
    }
    return
  }
  
  loadingUserOptions.value = true
  try {
    const res = await call('nextgrp.api.project.project_dashboard.get_project_members', {
      project_id: projectId
    })
    
    // Handle different response formats
    let members = []
    if (res?.message?.result) {
      members = res.message.result
    } else if (res?.result) {
      members = res.result
    } else if (Array.isArray(res)) {
      members = res
    } else if (res?.data) {
      members = Array.isArray(res.data) ? res.data : []
    }
    
    userOptions.value = members.map((user) => ({
      label: user.officer_name || user.name || user.label || user.officer_name || '',
      value: user.officer_id || user.id || user.value || user.mobile_no || '',
      avatar: user.avatar || user.user_image || user.image || '',
      position: user.position || '',
      department: user.department_name || user.department || '',
      email: user.email || user.user || ''
    })).filter(user => user.value && user.label) // Filter out invalid entries
    
    // Add owner to options if in from-node mode and not already in list
    if (props.mode === 'from-node' && props.nodeOwner) {
      const ownerInfo = await fetchOwnerInfo(props.nodeOwner)
      if (ownerInfo) {
        const ownerEmail = ownerInfo.email || ownerInfo.user
        // Use officer_id (Officer name) as value, fallback to other IDs
        const ownerValue = ownerInfo.officer_id || ownerInfo.mobile_no || ownerInfo.id || ownerInfo.user
        
        // Check if owner already exists in options
        const ownerExists = userOptions.value.some(user => 
          user.email === ownerEmail || 
          user.value === ownerValue ||
          user.value === ownerInfo.officer_id
        )
        
        if (!ownerExists && ownerValue) {
          const ownerOption = {
            label: ownerInfo.full_name || ownerInfo.user,
            value: ownerValue, // This should be Officer name/ID
            avatar: ownerInfo.user_image || '',
            position: '',
            department: '',
            email: ownerEmail
          }
          // Add owner at the beginning of the list
          userOptions.value.unshift(ownerOption)
          console.log('Added owner to userOptions:', ownerOption)
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch user options:', error)
    userOptions.value = []
    // Still try to add owner if in from-node mode
    if (props.mode === 'from-node' && props.nodeOwner) {
      const ownerInfo = await fetchOwnerInfo(props.nodeOwner)
      if (ownerInfo) {
        // Use officer_id (Officer name) as value, fallback to other IDs
        const ownerValue = ownerInfo.officer_id || ownerInfo.mobile_no || ownerInfo.id || ownerInfo.user
        if (ownerValue) {
          const ownerOption = {
            label: ownerInfo.full_name || ownerInfo.user,
            value: ownerValue, // This should be Officer name/ID
            avatar: ownerInfo.user_image || '',
            position: '',
            department: '',
            email: ownerInfo.email || ownerInfo.user
          }
          userOptions.value = [ownerOption]
        }
      }
    }
  } finally {
    loadingUserOptions.value = false
  }
}

// Fetch section options from API
const fetchSectionOptions = async (projectId) => {
  if (!projectId) {
    sectionOptions.value = [{ label: 'Chưa phân nhóm', value: '_empty' }]
    return
  }
  
  loadingSectionOptions.value = true
  try {
    const res = await call('nextgrp.api.task_section.section.get_list_section', {
      project: projectId
    })
    
    console.log('fetchSectionOptions response:', res)
    
    // Handle different response formats
    let sections = []
    if (res?.message?.result) {
      sections = res.message.result
    } else if (res?.result) {
      sections = res.result
    } else if (Array.isArray(res)) {
      sections = res
    } else if (res?.data) {
      sections = Array.isArray(res.data) ? res.data : []
    }
    
    console.log('fetchSectionOptions sections:', sections)
    
    const formattedOptions = sections.map((section) => ({
      label: section.section_title || section.label || section.name || '',
      value: section.name || section.value || ''
    })).filter(option => option.label && option.value) // Filter out invalid entries
    
    formattedOptions.unshift({ label: 'Chưa phân nhóm', value: '_empty' })
    sectionOptions.value = formattedOptions
    console.log('fetchSectionOptions formattedOptions:', formattedOptions)
  } catch (error) {
    console.error('Failed to fetch section options:', error)
    sectionOptions.value = [{ label: 'Chưa phân nhóm', value: '_empty' }]
  } finally {
    loadingSectionOptions.value = false
  }
}

// Watch project to fetch user options and section options
watch(() => newTaskFormData.value.project, (newProject, oldProject) => {
  if (newProject?.value) {
    // Only fetch if project changed or if we don't have userOptions from props
    if (newProject.value !== oldProject?.value || (!props.userOptions || props.userOptions.length === 0)) {
      fetchUserOptions(newProject.value)
    }
    fetchSectionOptions(newProject.value)
    
    // Set default section_title to "Chưa phân nhóm" if not set
    if (!newTaskFormData.value.section_title) {
      newTaskFormData.value.section_title = { label: 'Chưa phân nhóm', value: '_empty' }
    }
  } else {
    // If no project, use props userOptions or clear
    if (props.userOptions && props.userOptions.length > 0) {
      userOptions.value = props.userOptions
    } else {
      userOptions.value = []
    }
    sectionOptions.value = [{ label: 'Chưa phân nhóm', value: '_empty' }]
    // Set default section_title to "Chưa phân nhóm" when no project
    if (props.mode === 'from-node' && !newTaskFormData.value.section_title) {
      newTaskFormData.value.section_title = { label: 'Chưa phân nhóm', value: '_empty' }
    }
  }
}, { immediate: true })

// Fetch projects by node owner
const fetchProjectsByOwner = async (ownerUser) => {
  if (!ownerUser) {
    return []
  }
  
  try {
    // Sử dụng cache ownerInfo để lấy officer_id thay vì gọi API lại
    let officerName = null
    if (ownerInfoCache.value[ownerUser]?.officer_id) {
      officerName = ownerInfoCache.value[ownerUser].officer_id
      console.log('fetchProjectsByOwner: Using cached officer:', officerName)
    } else {
      // Nếu chưa có trong cache, fetch ownerInfo (sẽ cache kết quả)
      const ownerInfo = await fetchOwnerInfo(ownerUser)
      officerName = ownerInfo?.officer_id
    }
    
    if (!officerName) {
      console.warn('No officer found for user:', ownerUser)
      return []
    }
    
    // Get projects where this officer is the project_owner
    const res = await call('nextgrp.api.project.project.get_projects', {
      only_my: false,
      filters: {
        project_owner: officerName
      },
      page: 1,
      page_size: 100
    })
    
    const projects = res?.data || []
    return projects.map((project) => ({
      label: project.project_name || project.name,
      value: project.name,
      name: project.project_name,
      need_approve: project.need_approve,
      end_date: project.end_date
    }))
  } catch (error) {
    console.error('Failed to fetch projects by owner:', error)
    return []
  }
}

// Computed projects - use props.projectOptions or fetch by owner
const availableProjects = ref([])
const loadingProjects = ref(false)

watch(() => [props.mode, props.projectOptions, props.nodeOwner], async ([mode, projectOpts, owner]) => {
  if (mode === 'from-node') {
    if (owner) {
      // Fetch projects by node owner
      loadingProjects.value = true
      try {
        const projects = await fetchProjectsByOwner(owner)
        availableProjects.value = projects
      } catch (error) {
        console.error('Error fetching projects:', error)
        availableProjects.value = projectOpts || []
      } finally {
        loadingProjects.value = false
      }
    } else {
      // Fallback to props.projectOptions
      availableProjects.value = projectOpts || []
    }
  } else {
    availableProjects.value = projectOpts || []
  }
}, { immediate: true })

// Computed
const filteredNewTaskProjects = computed(() => {
  const projects = availableProjects.value.length > 0 ? availableProjects.value : (props.projectOptions || [])
  if (!newTaskProjectSearch.value) return projects
  return projects.filter(project => 
    (project.label || project).toLowerCase().includes(newTaskProjectSearch.value.toLowerCase())
  )
})

const filteredCollaboratorOptions = computed(() => {
  const search = collaboratorSearch.value.toLowerCase()
  return userOptions.value.filter(user => {
    const isAlreadyAdded = newTaskFormData.value.collaborator.some(c => c.id === user.value)
    if (isAlreadyAdded) return false
    
    return (
      (user.label || '').toLowerCase().includes(search) ||
      (user.email || '').toLowerCase().includes(search) ||
      (user.department || '').toLowerCase().includes(search)
    )
  })
})

// Min date là ngày hôm nay (không cho chọn ngày trong quá khứ)
const minDate = computed(() => {
  // Sử dụng local date để tránh vấn đề timezone
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` // Format: YYYY-MM-DD (local timezone)
})

const maxDate = computed(() => {
  const project = newTaskFormData.value.project
  // Kiểm tra end_date không phải null, undefined, hoặc empty string
  if (project?.end_date && project.end_date !== null && project.end_date !== '') {
    try {
      const endDate = new Date(project.end_date)
      if (isNaN(endDate.getTime())) {
        console.warn('[maxDate] Invalid end_date:', project.end_date)
        return null
      }
      const formatted = endDate.toISOString().split('T')[0]
      return formatted
    } catch (error) {
      console.error('[maxDate] Error formatting date:', error)
      return null
    }
  }
  return null
})

// Validate duration khi user chọn ngày
const validateDuration = () => {
  durationError.value = ''
  const duration = newTaskFormData.value.duration
  
  if (!duration) {
    return
  }
  
  // Parse selected date (format: YYYY-MM-DD)
  const [selectedYear, selectedMonth, selectedDay] = duration.split('-').map(Number)
  const selectedDate = new Date(selectedYear, selectedMonth - 1, selectedDay)
  
  // Get today's date (local timezone)
  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth()
  const todayDay = today.getDate()
  const todayDate = new Date(todayYear, todayMonth, todayDay)
  
  // Kiểm tra ngày không được nhỏ hơn ngày hôm nay
  if (selectedDate < todayDate) {
    durationError.value = 'Thời hạn không được nhỏ hơn ngày hôm nay'
    // Clear duration nếu nhỏ hơn ngày hôm nay
    newTaskFormData.value.duration = null
    return
  }
  
  // Kiểm tra ngày không được vượt quá ngày kết thúc dự án
  const project = newTaskFormData.value.project
  if (project?.end_date) {
    const maxEndDate = new Date(project.end_date)
    
    if (selectedDate > maxEndDate) {
      durationError.value = `Thời hạn không được vượt quá ngày kết thúc dự án (${maxDate.value})`
      // Clear duration nếu vượt quá
      newTaskFormData.value.duration = null
    }
  }
}

// Methods
const toggleNewTaskProject = () => {
  newTaskProjectOpen.value = !newTaskProjectOpen.value
}

const selectNewTaskProject = async (project) => {
  const oldProject = newTaskFormData.value.project
  
  console.log('[selectNewTaskProject] Selected project:', project)
  console.log('[selectNewTaskProject] props.projectOptions:', props.projectOptions)
  
  // Tìm project đầy đủ thông tin từ props.projectOptions (đã có sẵn từ API get_my_projects)
  let projectWithFullInfo = { ...project }
  
  if (props.projectOptions && props.projectOptions.length > 0) {
    const fullProject = props.projectOptions.find(p => p.value === project.value)
    console.log('[selectNewTaskProject] Found fullProject in props:', fullProject)
    
    if (fullProject) {
      // Merge thông tin từ props (có end_date, need_approve) với project được chọn
      projectWithFullInfo = {
        ...project,
        end_date: fullProject.end_date || project.end_date || null,
        need_approve: fullProject.need_approve !== undefined ? fullProject.need_approve : (project.need_approve !== undefined ? project.need_approve : false)
      }
      console.log('[selectNewTaskProject] Merged project with props:', projectWithFullInfo)
      
      // Nếu end_date là null trong props, fetch từ API để đảm bảo có giá trị đúng
      if (!projectWithFullInfo.end_date || projectWithFullInfo.end_date === null) {
        console.log('[selectNewTaskProject] end_date is null, fetching from API...')
        try {
          const projectRes = await call('frappe.client.get_value', {
            doctype: 'Project',
            filters: { name: project.value },
            fieldname: ['end_date', 'need_approve']
          })
          if (projectRes?.message) {
            projectWithFullInfo.end_date = projectRes.message.end_date
            projectWithFullInfo.need_approve = projectRes.message.need_approve
            console.log('[selectNewTaskProject] Fetched from API (message):', projectRes.message)
          } else if (projectRes) {
            projectWithFullInfo.end_date = projectRes.end_date
            projectWithFullInfo.need_approve = projectRes.need_approve
            console.log('[selectNewTaskProject] Fetched from API (direct):', projectRes)
          }
        } catch (error) {
          console.error('[selectNewTaskProject] Failed to fetch from API:', error)
        }
      }
    } else {
      console.warn('[selectNewTaskProject] Full project not found in props.projectOptions for:', project.value)
      // Nếu không tìm thấy trong props, fetch từ API
      if (!project.end_date || project.end_date === null) {
        try {
          const projectRes = await call('frappe.client.get_value', {
            doctype: 'Project',
            filters: { name: project.value },
            fieldname: ['end_date', 'need_approve']
          })
          if (projectRes?.message) {
            projectWithFullInfo.end_date = projectRes.message.end_date
            projectWithFullInfo.need_approve = projectRes.message.need_approve
            console.log('[selectNewTaskProject] Fetched from API (not in props):', projectRes.message)
          } else if (projectRes) {
            projectWithFullInfo.end_date = projectRes.end_date
            projectWithFullInfo.need_approve = projectRes.need_approve
            console.log('[selectNewTaskProject] Fetched from API (not in props, direct):', projectRes)
          }
        } catch (error) {
          console.error('[selectNewTaskProject] Failed to fetch from API:', error)
        }
      }
    }
  } else {
    console.warn('[selectNewTaskProject] props.projectOptions is empty or undefined')
    // Nếu props.projectOptions rỗng và project không có end_date, fetch từ API
    if (!project.end_date) {
      try {
        const projectRes = await call('frappe.client.get_value', {
          doctype: 'Project',
          filters: { name: project.value },
          fieldname: ['end_date', 'need_approve']
        })
        if (projectRes?.message) {
          projectWithFullInfo.end_date = projectRes.message.end_date
          projectWithFullInfo.need_approve = projectRes.message.need_approve
        } else if (projectRes) {
          projectWithFullInfo.end_date = projectRes.end_date
          projectWithFullInfo.need_approve = projectRes.need_approve
        }
      } catch (error) {
        console.error('[selectNewTaskProject] Failed to fetch from API:', error)
      }
    }
  }
  
  // Clear thời hạn khi chọn dự án mới
  newTaskFormData.value.duration = null
  
  newTaskFormData.value.project = projectWithFullInfo
  console.log('[selectNewTaskProject] Final project set:', newTaskFormData.value.project)
  newTaskProjectOpen.value = false
  newTaskProjectSearch.value = ''
  
  // Only preserve assignee if:
  // 1. In from-node mode with nodeOwner
  // 2. This is the first time selecting a project (oldProject is null/undefined)
  // 3. Assignee is already set
  const isFirstProjectSelection = !oldProject || !oldProject.value
  const shouldPreserveAssignee = props.mode === 'from-node' && 
                                  props.nodeOwner && 
                                  isFirstProjectSelection &&
                                  newTaskFormData.value.name_assign_to
  
  // Reset related fields when project changes
  // Set default section_title to "Chưa phân nhóm"
  newTaskFormData.value.section_title = { label: 'Chưa phân nhóm', value: '_empty' }
  
  // Clear assignee and collaborators if switching to a different project
  // But preserve if this is the first project selection in from-node mode
  if (!shouldPreserveAssignee) {
    newTaskFormData.value.name_assign_to = null
    // Also clear collaborators when clearing assignee (unless preserving)
    newTaskFormData.value.collaborator = []
  } else {
    // Even if preserving assignee, clear collaborators that are not the assignee
    // Keep only the assignee in collaborators if they exist there
    if (newTaskFormData.value.name_assign_to) {
      const assigneeId = newTaskFormData.value.name_assign_to.value
      newTaskFormData.value.collaborator = newTaskFormData.value.collaborator.filter(
        c => c.id === assigneeId || c.value === assigneeId
      )
    } else {
      newTaskFormData.value.collaborator = []
    }
  }
  
  newTaskFormData.value.assigned_by = null
  
  if (formErrors.value.project) {
    delete formErrors.value.project
  }
  
  // Fetch user options and section options immediately when project is selected
  if (project?.value) {
    await fetchUserOptions(project.value)
    await fetchSectionOptions(project.value)
    
    // Ensure section_title is set to default after fetching options
    if (!newTaskFormData.value.section_title || newTaskFormData.value.section_title.value !== '_empty') {
      newTaskFormData.value.section_title = { label: 'Chưa phân nhóm', value: '_empty' }
    }
    
    // After fetching user options, set owner as assignee if in from-node mode
    if (props.mode === 'from-node' && props.nodeOwner) {
      // Wait a bit for userOptions to be populated
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Set owner as assignee (will find in userOptions or create new)
      if (!newTaskFormData.value.name_assign_to) {
        await setOwnerAsAssignee()
      } else {
        // If assignee already set, make sure it matches owner
        const currentAssigneeEmail = newTaskFormData.value.name_assign_to?.email
        if (currentAssigneeEmail !== props.nodeOwner) {
          await setOwnerAsAssignee()
        }
      }
    }
  }
}

const handleTaskNameInput = (e) => {
  const textarea = taskNameTextarea.value
  if (textarea) {
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    const lineHeight = 24
    const minHeight = lineHeight * 1
    // Bỏ giới hạn maxHeight để cho phép hiển thị full độ dài
    const newHeight = Math.max(scrollHeight, minHeight)
    textarea.style.height = `${newHeight}px`
  }
  
  if (e.target.value.length > 500) {
    maxLengthError.value = 'Tên công việc không được vượt quá 500 ký tự.'
  } else {
    maxLengthError.value = ''
  }
}

const updateFormField = (fieldName, value) => {
  newTaskFormData.value[fieldName] = value
  
  // Handle collaborator updates
  if (fieldName === 'name_assign_to' || fieldName === 'assigned_by') {
    const currentCollaborators = newTaskFormData.value.collaborator || []
    const filtered = currentCollaborators.filter(c => c.type !== fieldName)
    
    if (value) {
      const newCollaborator = {
        id: value.value || value,
        name: value.label || value.name || '',
        avatar: value.avatar,
        isRemove: false,
        type: fieldName
      }
      newTaskFormData.value.collaborator = [...filtered, newCollaborator]
    } else {
      newTaskFormData.value.collaborator = filtered
    }
  }
}

const getDisplayValue = (value) => {
  if (!value) return ''
  if (typeof value === 'object' && value.label) {
    return value.label
  }
  if (typeof value === 'string') {
    return value
  }
  return ''
}

const toggleAssigneeSelect = () => {
  assigneeSelectOpen.value = !assigneeSelectOpen.value
  
  // Auto-fetch if project is selected but no userOptions yet
  if (assigneeSelectOpen.value && newTaskFormData.value.project?.value && userOptions.value.length === 0 && !loadingUserOptions.value) {
    fetchUserOptions(newTaskFormData.value.project.value)
  }
}

const selectAssigneeOption = (option) => {
  updateFormField('name_assign_to', option)
  assigneeSelectOpen.value = false
}

const toggleApproverSelect = () => {
  approverSelectOpen.value = !approverSelectOpen.value
  
  // Auto-fetch if project is selected but no userOptions yet
  if (approverSelectOpen.value && newTaskFormData.value.project?.value && userOptions.value.length === 0 && !loadingUserOptions.value) {
    fetchUserOptions(newTaskFormData.value.project.value)
  }
}

const selectApproverOption = (option) => {
  updateFormField('assigned_by', option)
  approverSelectOpen.value = false
}

const togglePrioritySelect = () => {
  prioritySelectOpen.value = !prioritySelectOpen.value
}

const selectPriorityOption = (option) => {
  updateFormField('priority', option)
  prioritySelectOpen.value = false
}

const toggleSectionSelect = () => {
  sectionSelectOpen.value = !sectionSelectOpen.value
}

const selectSectionOption = (option) => {
  updateFormField('section_title', option)
  sectionSelectOpen.value = false
}

// Description Editor Methods
const handleDescriptionInput = (e) => {
  newTaskFormData.value.description = e.target.innerHTML
}

// Watch description to update editor content
watch(() => newTaskFormData.value.description, (newDescription) => {
  if (descriptionEditorRef.value && newDescription) {
    // Only update if content is different to avoid infinite loop
    const currentContent = descriptionEditorRef.value.innerHTML || descriptionEditorRef.value.textContent || ''
    const newContent = typeof newDescription === 'string' ? newDescription : ''
    
    // If it's plain text, convert to HTML
    if (newContent && !newContent.includes('<')) {
      descriptionEditorRef.value.textContent = newContent
    } else if (newContent && currentContent !== newContent) {
      // Use innerHTML to preserve HTML tags like <a>
      descriptionEditorRef.value.innerHTML = newContent
      // Force re-render to ensure links are styled correctly
      const links = descriptionEditorRef.value.querySelectorAll('a')
      links.forEach(link => {
        if (!link.style.color) {
          link.style.color = '#2563eb'
          link.style.textDecoration = 'underline'
          link.style.cursor = 'pointer'
        }
      })
    }
  }
}, { immediate: true })

const handleEditorKeydown = (e) => {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case 'b':
        e.preventDefault()
        toggleBold()
        break
      case 'i':
        e.preventDefault()
        toggleItalic()
        break
    }
  }
}

const toggleBold = () => {
  document.execCommand('bold', false, null)
  isBold.value = document.queryCommandState('bold')
}

const toggleItalic = () => {
  document.execCommand('italic', false, null)
  isItalic.value = document.queryCommandState('italic')
}

const toggleBulletList = () => {
  document.execCommand('insertUnorderedList', false, null)
}

const toggleNumberedList = () => {
  document.execCommand('insertOrderedList', false, null)
}

const toggleBlockquote = () => {
  const selection = window.getSelection()
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const blockquote = document.createElement('blockquote')
    blockquote.style.borderLeft = '4px solid #3b82f6'
    blockquote.style.paddingLeft = '1rem'
    blockquote.style.paddingTop = '0.5rem'
    blockquote.style.paddingBottom = '0.5rem'
    blockquote.style.margin = '0.5rem 0'
    blockquote.style.backgroundColor = '#f9fafb'
    
    try {
      range.surroundContents(blockquote)
    } catch (e) {
      blockquote.appendChild(range.extractContents())
      range.insertNode(blockquote)
    }
  }
}

const showLinkDialog = () => {
  const url = prompt('Nhập URL:')
  if (url) {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    document.execCommand('createLink', false, fullUrl)
  }
}

const triggerFileUpload = () => {
  fileInputRef.value?.click()
}

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files || [])
  newTaskFormData.value.files = [...(newTaskFormData.value.files || []), ...files]
  
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const removeFile = (index) => {
  newTaskFormData.value.files.splice(index, 1)
}

// Collaborators Methods
const toggleCollaboratorDropdown = (e) => {
  if (e) {
    e.stopPropagation()
  }
  console.log('toggleCollaboratorDropdown called, current state:', collaboratorDropdownOpen.value)
  collaboratorDropdownOpen.value = !collaboratorDropdownOpen.value
  console.log('New state:', collaboratorDropdownOpen.value)
  if (collaboratorDropdownOpen.value) {
    // Reset search when opening
    collaboratorSearch.value = ''
  }
}

const addCollaborator = (user) => {
  console.log('addCollaborator called with:', user)
  const newCollaborator = {
    id: user.value,
    name: user.label,
    email: user.email,
    avatar: user.avatar,
    department: user.department,
    isRemove: true,
    type: 'default'
  }
  newTaskFormData.value.collaborator = [...(newTaskFormData.value.collaborator || []), newCollaborator]
  collaboratorSearch.value = ''
  // Don't close dropdown automatically - let user add multiple collaborators
}

const removeCollaborator = (id) => {
  newTaskFormData.value.collaborator = newTaskFormData.value.collaborator.filter(c => c.id !== id)
}

// Click outside handlers
const handleNewTaskClickOutside = (e) => {
  // Check if click is on collaborator add button
  const collaboratorAddButton = e.target.closest('.task-new-collaborator-add')
  if (collaboratorAddButton) {
    return // Don't close if clicking the add button
  }
  
  // Check if click is on collaborator dropdown or any element inside it
  const collaboratorDropdown = e.target.closest('.task-new-collaborator-dropdown')
  const collaboratorOption = e.target.closest('.task-new-collaborator-option')
  if (collaboratorDropdown || collaboratorOption) {
    return // Don't close if clicking inside the collaborator dropdown
  }
  
  const dropdowns = [
    { open: newTaskProjectOpen, ref: newTaskProjectRef },
    { open: assigneeSelectOpen, ref: assigneeSelectRef },
    { open: approverSelectOpen, ref: approverSelectRef },
    { open: prioritySelectOpen, ref: prioritySelectRef },
    { open: sectionSelectOpen, ref: sectionSelectRef },
    { open: collaboratorDropdownOpen, ref: collaboratorDropdownRef }
  ]
  
  dropdowns.forEach(({ open, ref }) => {
    if (open.value && ref.value && !ref.value.contains(e.target)) {
      open.value = false
    }
  })
}

// Validate form
const validateForm = () => {
  const errors = {}
  
  if (!newTaskFormData.value.task_name?.trim()) {
    errors.task_name = 'Tên công việc là bắt buộc'
  } else if (newTaskFormData.value.task_name.length > 500) {
    errors.task_name = 'Tên công việc không được vượt quá 500 ký tự.'
    maxLengthError.value = 'Tên công việc không được vượt quá 500 ký tự.'
  } else {
    maxLengthError.value = '' // Clear error nếu hợp lệ
  }
  
  if (!newTaskFormData.value.project) {
    errors.project = 'Dự án là bắt buộc'
  }
  
  if (!newTaskFormData.value.name_assign_to) {
    errors.name_assign_to = 'Người thực hiện là bắt buộc'
  }
  
  if (newTaskFormData.value.project?.need_approve && !newTaskFormData.value.assigned_by) {
    errors.assigned_by = 'Người phê duyệt là bắt buộc khi dự án yêu cầu phê duyệt'
  }
  
  // Validate duration không được nhỏ hơn ngày hôm nay và không được vượt quá end_date của dự án
  if (newTaskFormData.value.duration) {
    // Parse selected date (format: YYYY-MM-DD)
    const [selectedYear, selectedMonth, selectedDay] = newTaskFormData.value.duration.split('-').map(Number)
    const selectedDate = new Date(selectedYear, selectedMonth - 1, selectedDay)
    
    // Get today's date (local timezone)
    const today = new Date()
    const todayYear = today.getFullYear()
    const todayMonth = today.getMonth()
    const todayDay = today.getDate()
    const todayDate = new Date(todayYear, todayMonth, todayDay)
    
    // Kiểm tra ngày không được nhỏ hơn ngày hôm nay
    if (selectedDate < todayDate) {
      errors.duration = 'Thời hạn không được nhỏ hơn ngày hôm nay'
      durationError.value = errors.duration
    }
    
    // Kiểm tra ngày không được vượt quá ngày kết thúc dự án
    if (newTaskFormData.value.project?.end_date) {
      const maxEndDate = new Date(newTaskFormData.value.project.end_date)
      if (selectedDate > maxEndDate) {
        errors.duration = `Thời hạn không được vượt quá ngày kết thúc dự án (${maxDate.value})`
        durationError.value = errors.duration
      }
    }
  }
  
  formErrors.value = errors
  return Object.keys(errors).length === 0
}

// Handle create task
const handleCreateTask = () => {
  // Kiểm tra độ dài task_name trước khi submit - chặn không cho tạo công việc
  if (newTaskFormData.value.task_name && newTaskFormData.value.task_name.length > 500) {
    maxLengthError.value = 'Tên công việc không được vượt quá 500 ký tự.'
    formErrors.value = {
      ...formErrors.value,
      task_name: 'Tên công việc không được vượt quá 500 ký tự.'
    }
    return // Chặn không cho submit
  }
  
  // Validate form và chỉ submit nếu hợp lệ
  if (validateForm()) {
    emit('createTask', newTaskFormData.value)
  }
}

// Check if form is valid
const isFormValid = computed(() => {
  // Kiểm tra độ dài task_name không được vượt quá 500 ký tự
  const taskNameValid = newTaskFormData.value.task_name?.trim() && 
    newTaskFormData.value.task_name.length <= 500
  
  return (
    taskNameValid &&
    newTaskFormData.value.project &&
    newTaskFormData.value.name_assign_to &&
    (!newTaskFormData.value.project?.need_approve || newTaskFormData.value.assigned_by)
  )
})

// Function to set owner as assignee
const setOwnerAsAssignee = async () => {
  console.log('setOwnerAsAssignee called', { mode: props.mode, nodeOwner: props.nodeOwner })
  if (props.mode === 'from-node' && props.nodeOwner) {
    try {
      console.log('Fetching owner info for:', props.nodeOwner)
      const ownerInfo = await fetchOwnerInfo(props.nodeOwner)
      console.log('Owner info received:', ownerInfo)
            if (ownerInfo) {
              const ownerEmail = ownerInfo.email || ownerInfo.user
              // Use officer_id (Officer name) as value, fallback to other IDs
              const ownerValue = ownerInfo.officer_id || ownerInfo.mobile_no || ownerInfo.id || ownerInfo.user

              // Try to find owner in userOptions first (preferred - matches format)
              let ownerOption = null
              if (userOptions.value.length > 0) {
                ownerOption = userOptions.value.find(user =>
                  user.email === ownerEmail ||
                  user.value === ownerValue ||
                  user.value === ownerInfo.officer_id
                )
                console.log('Found owner in userOptions:', ownerOption)
              }

              // If not found in userOptions, create from ownerInfo
              if (!ownerOption && ownerValue) {
                ownerOption = {
                  value: ownerValue, // This should be Officer name/ID
                  label: ownerInfo.full_name || ownerInfo.user,
                  avatar: ownerInfo.user_image || '',
                  name: ownerInfo.full_name || ownerInfo.user,
                  email: ownerEmail
                }
                console.log('Created ownerOption from ownerInfo:', ownerOption)

                // Add to userOptions if not already there
                const existsInOptions = userOptions.value.some(user =>
                  user.email === ownerEmail ||
                  user.value === ownerValue
                )
                if (!existsInOptions) {
                  userOptions.value.unshift(ownerOption)
                  console.log('Added owner to userOptions')
                }
              }
        
        console.log('Setting ownerOption as assignee:', ownerOption)
        // Directly set instead of using updateFormField
        newTaskFormData.value.name_assign_to = ownerOption
        console.log('name_assign_to after set:', newTaskFormData.value.name_assign_to)
        
        // Also add to collaborators
        const existingCollab = newTaskFormData.value.collaborator.find(c => 
          c.id === ownerOption.value || 
          c.email === ownerOption.email
        )
        if (!existingCollab) {
          newTaskFormData.value.collaborator.push({
            id: ownerOption.value,
            name: ownerOption.label || ownerOption.name,
            avatar: ownerOption.avatar,
            email: ownerOption.email,
            isRemove: false,
            type: 'name_assign_to'
          })
          console.log('Added owner to collaborators')
        }
      } else {
        console.warn('Owner info is null or undefined')
      }
    } catch (error) {
      console.error('Error setting owner as assignee:', error)
    }
  } else {
    console.log('Conditions not met:', { mode: props.mode, nodeOwner: props.nodeOwner })
  }
}

// Initialize form when mode changes
watch(() => props.mode, async (newMode, oldMode) => {
  console.log('Mode changed:', { newMode, oldMode, nodeOwner: props.nodeOwner, nodeTitle: props.nodeTitle })
  if (newMode === 'from-node') {
    // Reset form data when switching to from-node mode
    if (oldMode !== 'from-node') {
      newTaskFormData.value = {
        task_name: '',
        project: null,
        description: '',
        name_assign_to: null,
        assigned_by: null,
        priority: { label: 'Trung bình', value: 'Medium' },
        duration: null,
        section_title: null,
        collaborator: [],
        files: []
      }
    }
    
    // Add owner to userOptions immediately (before selecting project)
    if (props.nodeOwner) {
      await addOwnerToUserOptions()
    }
    
    // Initialize task name from node title
    if (props.nodeTitle) {
      newTaskFormData.value.task_name = props.nodeTitle
      // Trigger auto-resize sau khi set giá trị
      nextTick(() => {
        if (taskNameTextarea.value) {
          handleTaskNameInput({ target: taskNameTextarea.value })
        }
      })
    }
    
    // Set nhóm công việc mặc định là "Chưa phân nhóm"
    if (!newTaskFormData.value.section_title) {
      newTaskFormData.value.section_title = { label: 'Chưa phân nhóm', value: '_empty' }
    }
    
    // Set người thực hiện mặc định là owner của node
    // Wait a bit to ensure nodeOwner is available
    if (props.nodeOwner) {
      await setOwnerAsAssignee()
    } else {
      // If nodeOwner not available yet, wait and try again
      setTimeout(async () => {
        if (props.nodeOwner && !newTaskFormData.value.name_assign_to) {
          await addOwnerToUserOptions()
          await setOwnerAsAssignee()
        }
      }, 300)
    }
    
    // Auto-fill mô tả theo format mới
    const mindmapTitle = props.mindmapTitle || ''
    const nodeTitle = props.nodeTitle || ''
    const team = props.team || ''
    const mindmapId = props.mindmapId || ''
    const nodeId = props.nodeId || ''
    
    let descriptionText = ''
    const parts = []
    
    // Tự động tạo từ sơ đồ tư duy: "Tên mindmap"
    if (mindmapTitle) {
      parts.push(`Tự động tạo từ sơ đồ tư duy: ${mindmapTitle}`)
    }
    
    // Nhánh: "Tên nhánh"
    if (nodeTitle) {
      parts.push(`Nhánh: ${nodeTitle}`)
    }
    
    // Liên kết: "Link của node"
    let linkUrl = props.nodeLink || ''
    if (!linkUrl && team && mindmapId && nodeId) {
      const origin = window.location.origin
      linkUrl = `${origin}/drive/t/${team}/mindmap/${mindmapId}#node-${nodeId}`
    }
    if (linkUrl) {
      parts.push(`Liên kết: <a href="${linkUrl}" target="_blank">${linkUrl}</a>`)
    }
    
    descriptionText = parts.join('<br>')
    newTaskFormData.value.description = descriptionText
  }
}, { immediate: true })

// Watch for nodeOwner changes (when mode is already 'from-node')
watch(() => [props.mode, props.nodeOwner], async ([mode, nodeOwner]) => {
  if (mode === 'from-node' && nodeOwner) {
    // Only update if assignee is not set or if it's different from current owner
    const currentAssigneeEmail = newTaskFormData.value.name_assign_to?.email
    if (!currentAssigneeEmail || currentAssigneeEmail !== nodeOwner) {
      await setOwnerAsAssignee()
    }
  }
}, { immediate: true })

// Watch task_name để tự động resize textarea khi giá trị thay đổi
watch(() => newTaskFormData.value.task_name, () => {
  nextTick(() => {
    if (taskNameTextarea.value) {
      handleTaskNameInput({ target: taskNameTextarea.value })
    }
  })
})

// Watch for visible prop to set assignee when modal opens
watch(() => props.visible, async (isVisible) => {
  console.log('Visible changed:', isVisible, { mode: props.mode, nodeOwner: props.nodeOwner, nodeTitle: props.nodeTitle })
  if (isVisible && props.mode === 'from-node') {
    // Wait a bit to ensure all props are ready
    await new Promise(resolve => setTimeout(resolve, 300))
    console.log('After delay - Checking:', { 
      nodeOwner: props.nodeOwner, 
      nodeTitle: props.nodeTitle,
      currentAssignee: newTaskFormData.value.name_assign_to,
      currentTaskName: newTaskFormData.value.task_name
    })
    
    // Set task_name từ nodeTitle nếu chưa có hoặc đang rỗng
    if (props.nodeTitle && (!newTaskFormData.value.task_name || newTaskFormData.value.task_name.trim() === '')) {
      newTaskFormData.value.task_name = props.nodeTitle
    }
    
    if (props.nodeOwner) {
      // Always try to set assignee if nodeOwner is available
      if (!newTaskFormData.value.name_assign_to || 
          newTaskFormData.value.name_assign_to.email !== props.nodeOwner) {
        console.log('Setting owner as assignee (force)')
        await setOwnerAsAssignee()
      }
    }
  }
}, { immediate: true })

// Watch for mindmapTitle, nodeTitle, team, mindmapId, nodeId changes to update description
watch([() => props.mindmapTitle, () => props.nodeTitle, () => props.team, () => props.mindmapId, () => props.nodeId, () => props.nodeLink], () => {
  if (props.mode === 'from-node') {
    const mindmapTitle = props.mindmapTitle || ''
    const nodeTitle = props.nodeTitle || ''
    const team = props.team || ''
    const mindmapId = props.mindmapId || ''
    const nodeId = props.nodeId || ''
    
    let descriptionText = ''
    const parts = []
    
    // Tự động tạo từ sơ đồ tư duy: "Tên mindmap"
    if (mindmapTitle) {
      parts.push(`Tự động tạo từ sơ đồ tư duy: ${mindmapTitle}`)
    }
    
    // Nhánh: "Tên nhánh"
    if (nodeTitle) {
      parts.push(`Nhánh: ${nodeTitle}`)
    }
    
    // Liên kết: "Link của node"
    let linkUrl = props.nodeLink || ''
    if (!linkUrl && team && mindmapId && nodeId) {
      const origin = window.location.origin
      linkUrl = `${origin}/drive/t/${team}/mindmap/${mindmapId}#node-${nodeId}`
    }
    if (linkUrl) {
      parts.push(`Liên kết: <a href="${linkUrl}" target="_blank">${linkUrl}</a>`)
    }
    
    descriptionText = parts.join('<br>')
    
    // Only update if description is empty or matches the old format
    if (!newTaskFormData.value.description || 
        newTaskFormData.value.description === descriptionText ||
        newTaskFormData.value.description.match(/^[^"]*"[^"]*"$/) ||
        newTaskFormData.value.description.includes('<a href') ||
        newTaskFormData.value.description.includes('Tự động tạo từ sơ đồ tư duy')) {
      newTaskFormData.value.description = descriptionText
    }
  }
})

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('click', handleNewTaskClickOutside)
  
  // Set owner as assignee when component mounts if in from-node mode
  if (props.mode === 'from-node' && props.nodeOwner) {
    // Wait a bit to ensure all reactive data is ready
    await new Promise(resolve => setTimeout(resolve, 100))
    if (!newTaskFormData.value.name_assign_to) {
      console.log('onMounted: Setting owner as assignee')
      await setOwnerAsAssignee()
    }
  }
  
  // Resize textarea nếu có nội dung khi component mount
  await nextTick()
  if (taskNameTextarea.value && newTaskFormData.value.task_name) {
    handleTaskNameInput({ target: taskNameTextarea.value })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('click', handleNewTaskClickOutside)
})
</script>

<style scoped>
.project-select-label{
  font-weight: 400;
  font-size: 14px;
  color: #111827;
  /* Giới hạn hiển thị 1 dòng với dấu ... nếu dài */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  min-width: 0;
  text-align: left;
}

.task-link-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.task-link-modal {
  width: 860px; 
  height: 94vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.15);
  padding: 20px;
}

.task-link-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-link-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.task-link-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.task-link-subtitle {
  margin: 4px 0 0 0;
  color: #6b7280;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-link-close {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  color: #6b7280;
}

.task-link-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 12px;
  justify-content: flex-start;
  border: 0.5px solid #d1d5db;
  background: #f8fafc;
  width: fit-content;
  border-radius: 10px;
  padding: 6px;
}

.task-link-tab {
  flex: 0 0 auto;
  padding: 8px 12px;
  min-width: 170px;
  background: #f8fafc;
  cursor: pointer;
  font-weight: 400;
  font-size: 14px;
  color: #374151;
  border-radius: 10px;
  overflow: hidden;
  border: none;
}

.task-link-tab.active {
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.task-link-tab:last-child {
  margin-left: -1px;
}

.task-link-body {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
}

.task-list-box {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-list-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-filter-row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.task-filter-row .task-link-search {
  margin-bottom: 0;
  flex: 1;
  width: 50%;
}

.task-project-select {
  position: relative;
  flex: 1;
  width: 50%;
  min-width: 0;
}

.project-select-trigger {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  min-width: 0;
  overflow: hidden;
}

.project-select-trigger:focus,
.project-select-trigger:focus-visible {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.project-select-caret {
  font-size: 14px;
  color: #6b7280;
  display: inline-flex;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.project-select-caret.open {
  transform: rotate(180deg);
}
.project-select-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
  z-index: 2000;
  max-height: 260px;
  overflow: auto;
  padding: 6px 0;
}

.project-select-item {
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 400;
  color: #111827;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-select-item:hover {
  background: #f3f4f6;
}

.project-select-item.active {
  background: #e8f0ff;
  color: #1d4ed8;
}

.task-link-search {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  margin-bottom: 12px;
}

.task-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 0;
}

.task-item {
  display: flex;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}

.task-item.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.task-item-radio {
  display: flex;
  align-items: center;
}

.task-item-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.task-item-title {
  font-weight: 500;
  font-size: 14px;
  color: #111827;
  /* Giới hạn hiển thị 1 dòng với dấu ... nếu dài */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  min-width: 0;
}

.task-item-meta {
  display: flex;
  gap: 8px;
  color: #6b7280;
  font-size: 13px;
  align-items: center;
}

.task-code {
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  /* Giới hạn hiển thị 1 dòng với dấu ... nếu dài */
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}

.task-assignee {
  font-size: 12px;
  padding-left: 8px;
  border-left: 1px solid #e5e7eb;
}

.task-status {
  padding: 1px 6px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
  font-size: 10px;
}

.status-green {
  background: #ecfdf3;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.status-blue {
  background: #e0f2fe;
  color: #075985;
  border: 1px solid #bae6fd;
}

.status-yellow {
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid #fde68a;
}

.status-red {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.status-purple {
  background: #f3e8ff;
  color: #6b21a8;
  border: 1px solid #e9d5ff;
}

.status-gray {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.task-empty {
  text-align: center;
  color: #9ca3af;
  padding: 16px 0;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
  height: 100%;
}

.task-link-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  margin-bottom: 8px;
  margin-top: 4px;
  width: fit-content;
}

.task-link-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
}

.task-pagination {
  display: flex;
  gap: 4px;
  align-items: center;
}

.task-page-numbers {
  display: flex;
  gap: 6px;
}

.task-page-btn {
  font-weight: 400;
  font-size: 14px;
  min-width: 28px;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}

.task-page-btn.active {
  background: #2563eb;
  color: #fff;
  border-color: #1d4ed8;
}

.task-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-page-ellipsis {
  padding: 0 4px;
  color: #6b7280;
  user-select: none;
}

.task-create-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
}

.task-create-title {
  margin: 0;
  font-weight: 700;
  color: #111827;
}

.task-create-desc {
  margin: 4px 0 10px 0;
  color: #6b7280;
}

.task-create-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: #f3f4f6;
  margin-bottom: 12px;
}

.task-code-placeholder {
  padding: 4px 8px;
  border-radius: 6px;
  background: #e5e7eb;
  color: #374151;
  font-weight: 600;
  font-size: 12px;
}

.task-link-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.task-link-btn {
  min-width: 120px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 400;
}

.task-link-btn.cancel {
  background: #e5e7eb;
  color: #374151;
}

.task-link-btn.primary {
  background: #2563eb;
  color: white;
}

.task-link-btn.primary:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

/* New Task Form Styles */
.task-new-info-section {
  border-bottom: 1px solid #e5e7eb;
  background: white;
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.task-new-project-section {
  margin-bottom: 12px;
}

.task-new-project-selector {
  position: relative;
}

.task-new-project-trigger {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
}

.task-new-project-trigger.error {
  border-color: #ef4444;
}

.task-new-project-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  z-index: 2000;
  max-height: 300px;
  display: flex;
  flex-direction: column;
}

.task-new-project-search {
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.task-new-project-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.task-new-project-list {
  max-height: 250px;
  overflow-y: auto;
  padding: 4px 0;
}

.task-new-project-item {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.15s;
}

.task-new-project-item:hover {
  background: #f3f4f6;
}

.task-new-project-item.active {
  background: #e8f0ff;
  color: #1d4ed8;
}

.task-new-project-empty {
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}

.task-new-project-loading {
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.task-new-project-loading svg {
  color: #2563eb;
}

.task-new-name-section {
  position: relative;
}

.task-new-name-input {
  width: 100%;
  font-size: 16px;
  font-weight: 600;
  resize: none;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 8px 12px;
  min-height: 34px;
  overflow-y: hidden; /* Ẩn scroll */
  overflow-x: hidden; /* Ẩn scroll ngang */
  word-wrap: break-word; /* Tự động xuống dòng */
  white-space: pre-wrap; /* Giữ nguyên xuống dòng và wrap text */
  transition: border-color 0.15s, background-color 0.15s;
}

.task-new-name-input:hover {
  border-color: #d1d5db;
  background: white;
}

.task-new-name-input:focus {
  outline: none;
  border-color: #2563eb;
  background: white;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.task-new-name-input.error {
  border-color: #ef4444;
}

.task-form-error {
  color: #ef4444;
  font-size: 12px;
  margin-top: 4px;
}

.task-new-basic-info {
  margin-bottom: 16px;
}

.task-new-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.task-new-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-new-form-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.required {
  color: #ef4444;
}

.task-new-form-input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.task-form-select-wrapper {
  position: relative;
}

.task-form-select-trigger {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.15s;
}

.task-form-select-trigger:hover {
  border-color: #9ca3af;
}

.task-form-select-value {
  color: #111827;
  text-align: left;
  flex: 1;
}

.task-form-select-value.placeholder {
  color: #9ca3af;
}

.task-form-select-caret {
  color: #6b7280;
  transition: transform 0.15s;
}

.task-form-select-caret.open {
  transform: rotate(180deg);
}

.task-form-select-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px 0;
}

.task-form-select-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.15s;
}

.task-form-select-item:hover {
  background: #f3f4f6;
}

.task-form-select-item.active {
  background: #e8f0ff;
  color: #1d4ed8;
}

.task-form-select-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.task-form-select-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-form-select-avatar-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  flex-shrink: 0;
}

.task-form-select-loading {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #6b7280;
  font-size: 14px;
}

.task-form-select-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.task-form-select-empty {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

.task-new-description-section {
  margin-bottom: 16px;
}

.task-new-description-editor {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.task-new-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.task-new-toolbar-btn {
  padding: 6px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, color 0.15s;
}

.task-new-toolbar-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.task-new-toolbar-btn.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.task-new-description-content {
  min-height: 120px;
  padding: 12px;
  outline: none;
  font-size: 14px;
  line-height: 1.5;
}

.task-new-description-content:empty::before {
  content: attr(data-placeholder);
  color: #9ca3af;
}

.task-new-description-content a {
  color: #2563eb !important;
  text-decoration: underline !important;
  cursor: pointer;
}

.task-new-description-content a:hover {
  color: #1d4ed8 !important;
  text-decoration: underline !important;
}

.task-new-attached-files {
  padding: 12px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.task-new-files-header {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}

.task-new-files-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-new-file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  color: #374151;
}

.task-new-file-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-new-file-remove {
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
}

.task-new-file-remove:hover {
  color: #ef4444;
}

.task-new-collaborators-section {
  border-top: 1px solid #e5e7eb;
  background: white;
  padding: 12px 16px;
}

.task-new-collaborators-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-new-collaborators-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.task-new-collaborators-list {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  flex: 1;
}

.task-new-collaborator-item-wrapper {
  position: relative;
}

.task-new-collaborator-item {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.task-new-collaborator-tooltip-trigger {
  position: relative;
}

.task-new-collaborator-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
}

.task-new-collaborator-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-new-collaborator-avatar-placeholder {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
}

.task-new-collaborator-remove {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid white;
  background: white;
  color: #6b7280;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.task-new-collaborator-item:hover .task-new-collaborator-remove {
  opacity: 1;
}

.task-new-collaborator-add {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px dashed #60a5fa;
  background: white;
  color: #2563eb;
  font-size: 18px;
  font-weight: 300;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s;
}

.task-new-collaborator-add:hover {
  background: #eff6ff;
}

.task-new-collaborator-dropdown {
  position: absolute;
  bottom: 80px;
  left: 16px;
  width: 320px;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  z-index: 50;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.task-new-collaborator-dropdown-header {
  padding: 8px 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-new-collaborator-dropdown-header-icon {
  color: #2563eb;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.task-new-collaborator-dropdown-header-text {
  flex: 1;
}

.task-new-collaborator-dropdown-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  flex: 1;
}

.task-new-collaborator-dropdown-header p {
  margin: 2px 0 0 0;
  font-size: 12px;
  color: #6b7280;
}

.task-new-collaborator-search {
  padding: 12px;
  position: relative;
}

.task-new-collaborator-search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
  z-index: 1;
}

.task-new-collaborator-search-input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.task-new-collaborator-search-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 1px #60a5fa;
}

.task-new-collaborator-options {
  max-height: 256px;
  overflow-y: auto;
}

.task-new-collaborator-option {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: background-color 0.15s;
  border-top: 1px solid #f3f4f6;
  border-bottom: 1px solid #f3f4f6;
  background: white;
  width: 100%;
  text-align: left;
}

.task-new-collaborator-option:last-child {
  border-bottom: none;
}

.task-new-collaborator-option:hover {
  background: #f9fafb;
}

.task-new-collaborator-option-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-new-collaborator-option-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-new-collaborator-option-avatar-placeholder {
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
}

.task-new-collaborator-option-info {
  flex: 1;
  min-width: 0;
  line-height: 1.25;
}

.task-new-collaborator-option-name {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 0;
}

.task-new-collaborator-option-email {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 0;
  font-weight: 500;
  line-height: 1.25;
}

.task-new-collaborator-option-department {
  font-size: 12px;
  color: #2563eb;
  font-weight: 500;
  margin-top: 2px;
  line-height: 1.25;
}

.task-new-collaborator-empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}

.task-new-collaborator-dropdown-footer {
  padding: 10px 16px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.task-new-collaborator-dropdown-footer p {
  margin: 4px 0;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  font-weight: 500;
}

/* Tooltip styles */
.task-new-collaborator-item-wrapper {
  position: relative;
}

.task-new-collaborator-tooltip-trigger {
  position: relative;
}

.task-new-collaborator-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 1000;
}

.task-new-collaborator-tooltip-trigger:hover .task-new-collaborator-tooltip {
  opacity: 1;
}

.task-new-collaborator-tooltip-content {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  padding: 12px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 200px;
  max-width: 300px;
  white-space: nowrap;
}

.task-new-collaborator-tooltip-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  flex-shrink: 0;
}

.task-new-collaborator-tooltip-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-new-collaborator-tooltip-avatar-placeholder {
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
}

.task-new-collaborator-tooltip-info {
  flex: 1;
  min-width: 0;
}

.task-new-collaborator-tooltip-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-new-collaborator-tooltip-role {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

/* Tooltip for add button */
.task-new-collaborator-add-wrapper {
  position: relative;
}

.task-new-collaborator-add-tooltip-trigger {
  position: relative;
}

.task-new-collaborator-add-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 1000;
  background: #111827;
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
}

.task-new-collaborator-add-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: #111827;
}

.task-new-collaborator-add-tooltip-trigger:hover .task-new-collaborator-add-tooltip {
  opacity: 1;
}
</style>

