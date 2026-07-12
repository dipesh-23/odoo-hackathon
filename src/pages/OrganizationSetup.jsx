import { useState, useEffect, useCallback } from "react";
import SpotlightCard from "../components/SpotlightCard";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
} from "../services/departmentService";
import { listCategories, createCategory } from "../services/categoryService";
import { listUsers } from "../services/userService";

const tabs = [
  { id: "departments", label: "Departments" },
  { id: "categories", label: "Categories" },
  { id: "employees", label: "Employees" },
];

export default function OrganizationSetup() {
  const [activeTab, setActiveTab] = useState("departments");

  // ─── Data from Firestore ──────────────────────────────────────
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // ─── Modal state ──────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);

  // Department form
  const [newDept, setNewDept] = useState({
    name: "",
    code: "",
    headName: "",
    parentDepartmentId: "",
    status: "Active",
  });

  // Category form
  const [newCat, setNewCat] = useState({ name: "", description: "" });

  // ─── Fetch helpers ────────────────────────────────────────────
  const fetchDepartments = useCallback(async () => {
    try {
      const data = await listDepartments();
      setDepartments(data);
    } catch (err) {
      console.error("Failed to load departments:", err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await listCategories();
      setCategories(data);
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await listUsers();
      setEmployees(data);
    } catch (err) {
      console.error("Failed to load employees:", err);
    }
  }, []);

  // ─── Initial load ─────────────────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([fetchDepartments(), fetchCategories(), fetchEmployees()]);
      setLoading(false);
    }
    loadAll();
  }, [fetchDepartments, fetchCategories, fetchEmployees]);

  // ─── Add Department ───────────────────────────────────────────
  const handleAddDepartment = async () => {
    if (!newDept.name.trim()) return;
    setErrorMsg(null);
    try {
      await createDepartment({
        name: newDept.name.trim(),
        code: newDept.code.trim() || newDept.name.trim().toUpperCase().slice(0, 4),
        headName: newDept.headName.trim() || null,
        headUserId: null,
        parentDepartmentId: newDept.parentDepartmentId || null,
      });
      setNewDept({ name: "", code: "", headName: "", parentDepartmentId: "", status: "Active" });
      setShowAddModal(false);
      await fetchDepartments();
    } catch (err) {
      console.error("Failed to add department:", err);
      setErrorMsg("Failed to add department. You might not have Admin permissions.");
    }
  };

  // ─── Add Category ─────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCat.name.trim()) return;
    setErrorMsg(null);
    try {
      await createCategory({
        name: newCat.name.trim(),
        customFields: { description: newCat.description.trim() },
      });
      setNewCat({ name: "", description: "" });
      setShowAddModal(false);
      await fetchCategories();
    } catch (err) {
      console.error("Failed to add category:", err);
      setErrorMsg("Failed to add category. You might not have Asset Manager permissions.");
    }
  };

  // ─── Toggle Department Status ─────────────────────────────────
  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    setErrorMsg(null);
    try {
      await updateDepartment(id, { status: newStatus });
      setDepartments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
      );
    } catch (err) {
      console.error("Failed to toggle status:", err);
      setErrorMsg("Failed to update status. Check your permissions.");
    }
  };

  // ─── Determine which "Add" modal to show ──────────────────────
  const showsAdd = activeTab === "departments" || activeTab === "categories";

  return (
    <div className="org-setup">
      {/* Page Header */}
      <div className="org-header">
        <div>
          <h1 className="org-title">Organization Setup</h1>
          <p className="org-subtitle">Manage departments, categories, and employees</p>
        </div>
      </div>

      {/* Tabs + Add Button */}
      <div className="org-tabs-bar">
        <div className="org-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              className={`org-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {showsAdd && (
          <button
            id="add-btn"
            className="org-add-btn"
            onClick={() => setShowAddModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add
          </button>
        )}
      </div>
      
      {errorMsg && (
        <div style={{ backgroundColor: "var(--error-bg)", color: "var(--error)", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
          {errorMsg}
        </div>
      )}

      {/* Content Area */}
      <SpotlightCard className="org-content-card">
        {loading ? (
          <div className="org-loading">
            <div className="org-spinner" />
            <p>Loading data…</p>
          </div>
        ) : (
          <>
            {/* ─── Departments Table ─────────────────────────── */}
            {activeTab === "departments" && (
              <div className="org-table-wrap">
                {departments.length === 0 ? (
                  <div className="org-empty">
                    <p>No departments yet. Click <strong>Add</strong> to create one.</p>
                  </div>
                ) : (
                  <table className="org-table">
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Code</th>
                        <th>Head</th>
                        <th>Employees</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((dept) => (
                        <tr key={dept.id}>
                          <td className="org-cell-name">{dept.name}</td>
                          <td className="org-cell-muted">{dept.code || "—"}</td>
                          <td>{dept.headName || "—"}</td>
                          <td>
                            <span className="count-badge">{dept.employeeCount ?? 0}</span>
                          </td>
                          <td>
                            <button
                              className={`status-pill ${dept.status === "Active" ? "status-active" : "status-inactive"}`}
                              onClick={() => toggleStatus(dept.id, dept.status)}
                            >
                              {dept.status}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="org-table-footer">
                  <p className="org-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    Editing a department here also drives the picklist in Assets &amp; Allocation screens.
                  </p>
                </div>
              </div>
            )}

            {/* ─── Categories Table ──────────────────────────── */}
            {activeTab === "categories" && (
              <div className="org-table-wrap">
                {categories.length === 0 ? (
                  <div className="org-empty">
                    <p>No categories yet. Click <strong>Add</strong> to create one.</p>
                  </div>
                ) : (
                  <table className="org-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat.id}>
                          <td className="org-cell-name">{cat.name}</td>
                          <td>{cat.customFields?.description || "—"}</td>
                          <td>
                            <span className={`status-pill ${cat.status === "Active" ? "status-active" : "status-inactive"}`}>
                              {cat.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ─── Employees Table ───────────────────────────── */}
            {activeTab === "employees" && (
              <div className="org-table-wrap">
                {employees.length === 0 ? (
                  <div className="org-empty">
                    <p>No employees found. Users appear here after signing up.</p>
                  </div>
                ) : (
                  <table className="org-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Department</th>
                        <th>Role</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.id}>
                          <td className="org-cell-name">{emp.name || "—"}</td>
                          <td>{emp.email}</td>
                          <td>{emp.departmentName || "Unassigned"}</td>
                          <td>
                            <span className="role-badge">{emp.role}</span>
                          </td>
                          <td>
                            <span className={`status-pill ${emp.status === "Active" ? "status-active" : "status-inactive"}`}>
                              {emp.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </SpotlightCard>

      {/* ─── Add Department Modal ──────────────────────────────── */}
      {showAddModal && activeTab === "departments" && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Department</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Department Name</label>
                <input
                  id="dept-name-input"
                  className="form-input"
                  placeholder="e.g. Marketing"
                  value={newDept.name}
                  onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Department Code</label>
                <input
                  id="dept-code-input"
                  className="form-input"
                  placeholder="e.g. MKT (auto-generated if empty)"
                  value={newDept.code}
                  onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Head</label>
                <input
                  id="dept-head-input"
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={newDept.headName}
                  onChange={(e) => setNewDept({ ...newDept, headName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Parent Department</label>
                <select
                  id="dept-parent-input"
                  className="form-input"
                  value={newDept.parentDepartmentId}
                  onChange={(e) => setNewDept({ ...newDept, parentDepartmentId: e.target.value })}
                >
                  <option value="">None (top-level)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline modal-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button id="confirm-add-dept" className="btn-primary modal-confirm" onClick={handleAddDepartment}>Add Department</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Category Modal ────────────────────────────────── */}
      {showAddModal && activeTab === "categories" && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Category</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Category Name</label>
                <input
                  id="cat-name-input"
                  className="form-input"
                  placeholder="e.g. Electronics"
                  value={newCat.name}
                  onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  id="cat-desc-input"
                  className="form-input"
                  placeholder="e.g. Laptops, monitors, peripherals"
                  value={newCat.description}
                  onChange={(e) => setNewCat({ ...newCat, description: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline modal-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button id="confirm-add-cat" className="btn-primary modal-confirm" onClick={handleAddCategory}>Add Category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
