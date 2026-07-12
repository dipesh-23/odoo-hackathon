import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import SpotlightCard from "../components/SpotlightCard";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
} from "../services/departmentService";
import {
  listCategories,
  createCategory,
  updateCategory,
} from "../services/categoryService";
import {
  listUsers,
  updateUserProfile,
  promoteUser,
} from "../services/userService";

const tabs = [
  { id: "departments", label: "Departments" },
  { id: "categories", label: "Categories" },
  { id: "employees", label: "Employees" },
];

export default function OrganizationSetup() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("departments");
  const [loading, setLoading] = useState(true);

  // Firestore Data State
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Modals visibility
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Add Department Form State
  const [deptForm, setDeptForm] = useState({
    name: "",
    code: "",
    headUserId: "",
    parentDepartmentId: "",
    status: "Active",
  });

  // Add Category Form State
  const [catForm, setCatForm] = useState({
    name: "",
    description: "",
    warrantyPeriodMonths: "",
  });

  // Edit Employee Form State
  const [empForm, setEmpForm] = useState({
    departmentId: "",
    role: "Employee",
    status: "Active",
  });

  // ── Load All Data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [depts, cats, emps] = await Promise.all([
        listDepartments(),
        listCategories(),
        listUsers(),
      ]);
      setDepartments(depts);
      setCategories(cats);
      setEmployees(emps);
    } catch (err) {
      console.error("Failed to load organization settings: ", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Department CRUD ──────────────────────────────────────────────────────
  const handleAddDept = async (e) => {
    e.preventDefault();
    if (!deptForm.name.trim() || !deptForm.code.trim()) return;

    setModalLoading(true);
    try {
      const headUser = employees.find((emp) => emp.id === deptForm.headUserId);
      await createDepartment({
        name: deptForm.name,
        code: deptForm.code.toUpperCase(),
        headUserId: deptForm.headUserId || null,
        headName: headUser ? headUser.name : null,
        parentDepartmentId: deptForm.parentDepartmentId || null,
      });

      setDeptForm({ name: "", code: "", headUserId: "", parentDepartmentId: "", status: "Active" });
      setShowDeptModal(false);
      await loadData();
    } catch (err) {
      alert("Failed to add department: " + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleDeptStatus = async (dept) => {
    const newStatus = dept.status === "Active" ? "Inactive" : "Active";
    try {
      await updateDepartment(dept.id, { status: newStatus });
      await loadData();
    } catch (err) {
      alert("Failed to toggle department status: " + err.message);
    }
  };

  // ── Category CRUD ────────────────────────────────────────────────────────
  const handleAddCat = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) return;

    setModalLoading(true);
    try {
      const customFields = {};
      if (catForm.description.trim()) {
        customFields.description = catForm.description.trim();
      }
      if (catForm.warrantyPeriodMonths.trim()) {
        customFields.warrantyPeriodMonths = Number(catForm.warrantyPeriodMonths);
      }

      await createCategory({
        name: catForm.name,
        customFields,
      });

      setCatForm({ name: "", description: "", warrantyPeriodMonths: "" });
      setShowCatModal(false);
      await loadData();
    } catch (err) {
      alert("Failed to add category: " + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleCatStatus = async (cat) => {
    const newStatus = cat.status === "Active" ? "Inactive" : "Active";
    try {
      await updateCategory(cat.id, { status: newStatus });
      await loadData();
    } catch (err) {
      alert("Failed to toggle category status: " + err.message);
    }
  };

  // ── Employee Management ──────────────────────────────────────────────────
  const handleOpenEditEmp = (emp) => {
    setEditEmployee(emp);
    setEmpForm({
      departmentId: emp.departmentId || "",
      role: emp.role || "Employee",
      status: emp.status || "Active",
    });
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      const dept = departments.find((d) => d.id === empForm.departmentId);
      
      // 1. Update basic profile info (department details & status)
      await updateUserProfile(editEmployee.id, {
        departmentId: empForm.departmentId || null,
        departmentName: dept ? dept.name : null,
        status: empForm.status,
      });

      // 2. Update role (requires separate promotion service helper)
      if (empForm.role !== editEmployee.role) {
        await promoteUser(currentUser.uid, editEmployee.id, empForm.role);
      }

      setEditEmployee(null);
      await loadData();
    } catch (err) {
      alert("Failed to save employee profile: " + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="assets-loading-state">
        <span className="spinner" />
        <p>Loading setup settings…</p>
      </div>
    );
  }

  return (
    <div className="org-setup">
      {/* Page Header */}
      <div className="org-header">
        <div>
          <h1 className="org-title">Organization Setup</h1>
          <p className="org-subtitle">Manage departments, asset categories, and employees</p>
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

        {activeTab === "departments" && (
          <button id="add-dept-btn" className="org-add-btn" onClick={() => setShowDeptModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Department
          </button>
        )}

        {activeTab === "categories" && (
          <button id="add-cat-btn" className="org-add-btn" onClick={() => setShowCatModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Category
          </button>
        )}
      </div>

      {/* Content Area */}
      <SpotlightCard className="org-content-card">
        
        {/* Departments Table */}
        {activeTab === "departments" && (
          <div className="org-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Department</th>
                  <th>Head</th>
                  <th>Parent Dept</th>
                  <th>Employees</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                      No departments registered yet.
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => {
                    const parent = departments.find((d) => d.id === dept.parentDepartmentId);
                    return (
                      <tr key={dept.id}>
                        <td style={{ fontFamily: "monospace", color: "#a78bfa" }}>{dept.code}</td>
                        <td className="org-cell-name">{dept.name}</td>
                        <td>{dept.headName || "—"}</td>
                        <td className="org-cell-muted">{parent ? parent.name : "—"}</td>
                        <td><span className="count-badge">{dept.employeeCount || 0}</span></td>
                        <td>
                          <button
                            className={`status-pill ${dept.status === "Active" ? "status-active" : "status-inactive"}`}
                            onClick={() => handleToggleDeptStatus(dept)}
                          >
                            {dept.status}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Categories Table */}
        {activeTab === "categories" && (
          <div className="org-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Description</th>
                  <th>Warranty (Months)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                      No categories registered yet.
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id}>
                      <td className="org-cell-name">{cat.name}</td>
                      <td>{cat.customFields?.description || "—"}</td>
                      <td>
                        {cat.customFields?.warrantyPeriodMonths ? (
                          <span className="role-badge" style={{ backgroundColor: "rgba(124, 58, 237, 0.1)", border: "1px solid rgba(124, 58, 237, 0.2)", color: "#c4b5fd" }}>
                            {cat.customFields.warrantyPeriodMonths} Months
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <button
                          className={`status-pill ${cat.status === "Active" ? "status-active" : "status-inactive"}`}
                          onClick={() => handleToggleCatStatus(cat)}
                        >
                          {cat.status}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Employees Table */}
        {activeTab === "employees" && (
          <div className="org-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                      No employees registered in the directory yet.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="org-cell-name">{emp.name || "—"}</td>
                      <td>{emp.email}</td>
                      <td className="org-cell-muted">{emp.departmentName || "Unassigned"}</td>
                      <td>
                        <span className={`role-badge ${emp.role === "Admin" ? "status-active" : ""}`}>
                          {emp.role || "Employee"}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${emp.status === "Active" ? "status-active" : "status-inactive"}`} style={{ cursor: "default" }}>
                          {emp.status || "Active"}
                        </span>
                      </td>
                      <td>
                        <button className="detail-panel-edit-btn" onClick={() => handleOpenEditEmp(emp)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </SpotlightCard>

      {/* Add Department Modal */}
      {showDeptModal && (
        <div className="modal-overlay" onClick={() => setShowDeptModal(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleAddDept}>
            <div className="modal-header">
              <h2>Add Department</h2>
              <button type="button" className="modal-close" onClick={() => setShowDeptModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Department Name *</label>
                <input
                  id="dept-name-input"
                  className="form-input"
                  placeholder="e.g. Engineering"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Department Code (Unique) *</label>
                <input
                  id="dept-code-input"
                  className="form-input"
                  placeholder="e.g. ENG"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Department Head</label>
                <select
                  id="dept-head-select"
                  className="form-input form-select"
                  value={deptForm.headUserId}
                  onChange={(e) => setDeptForm({ ...deptForm, headUserId: e.target.value })}
                >
                  <option value="">Select Department Head</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || emp.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Parent Department (Optional)</label>
                <select
                  id="dept-parent-select"
                  className="form-input form-select"
                  value={deptForm.parentDepartmentId}
                  onChange={(e) => setDeptForm({ ...deptForm, parentDepartmentId: e.target.value })}
                >
                  <option value="">Top Level (No Parent)</option>
                  {departments.filter(d => d.status === "Active").map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-outline modal-cancel" onClick={() => setShowDeptModal(false)}>Cancel</button>
              <button type="submit" id="confirm-add-dept" className="btn-primary modal-confirm" disabled={modalLoading}>
                {modalLoading ? "Adding..." : "Add Department"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleAddCat}>
            <div className="modal-header">
              <h2>Add Category</h2>
              <button type="button" className="modal-close" onClick={() => setShowCatModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Category Name *</label>
                <input
                  id="cat-name-input"
                  className="form-input"
                  placeholder="e.g. IT Equipment"
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  id="cat-desc-input"
                  className="form-input"
                  placeholder="e.g. Laptops, tablets, screens"
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Warranty Period (Months)</label>
                <input
                  id="cat-warranty-input"
                  className="form-input"
                  type="number"
                  placeholder="e.g. 12"
                  value={catForm.warrantyPeriodMonths}
                  onChange={(e) => setCatForm({ ...catForm, warrantyPeriodMonths: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-outline modal-cancel" onClick={() => setShowCatModal(false)}>Cancel</button>
              <button type="submit" id="confirm-add-cat" className="btn-primary modal-confirm" disabled={modalLoading}>
                {modalLoading ? "Adding..." : "Add Category"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editEmployee && (
        <div className="modal-overlay" onClick={() => setEditEmployee(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEmployee}>
            <div className="modal-header">
              <h2>Edit Employee Profile</h2>
              <button type="button" className="modal-close" onClick={() => setEditEmployee(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>
                Editing Profile for: <strong style={{ color: "var(--text-primary)" }}>{editEmployee.name || editEmployee.email}</strong>
              </p>
              
              <div className="form-group">
                <label className="form-label">Department</label>
                <select
                  id="emp-dept-select"
                  className="form-input form-select"
                  value={empForm.departmentId}
                  onChange={(e) => setEmpForm({ ...empForm, departmentId: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {departments.filter(d => d.status === "Active").map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  id="emp-role-select"
                  className="form-input form-select"
                  value={empForm.role}
                  onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                >
                  <option value="Employee">Employee</option>
                  <option value="DepartmentHead">Department Head</option>
                  <option value="AssetManager">Asset Manager</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <div className="modal-status-toggle">
                  <button
                    type="button"
                    className={`status-toggle-btn ${empForm.status === "Active" ? "active" : ""}`}
                    onClick={() => setEmpForm({ ...empForm, status: "Active" })}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`status-toggle-btn ${empForm.status === "Inactive" ? "active" : ""}`}
                    onClick={() => setEmpForm({ ...empForm, status: "Inactive" })}
                  >
                    Inactive
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-outline modal-cancel" onClick={() => setEditEmployee(null)}>Cancel</button>
              <button type="submit" id="confirm-save-emp" className="btn-primary modal-confirm" disabled={modalLoading}>
                {modalLoading ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
