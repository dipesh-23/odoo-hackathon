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
  const { currentUser, userProfile } = useAuth();
  const currentRole = userProfile?.role || "Employee";
  const [activeTab, setActiveTab] = useState("departments");
  const [loading, setLoading] = useState(true);

  // Firestore Data State
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // Modals visibility
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [editDept, setEditDept] = useState(null);
  const [viewDept, setViewDept] = useState(null);
  const [assignEmpId, setAssignEmpId] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Role Change Dialog (from ours)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState(null); // { employee, newRole }

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
    setErrorMsg("");
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
      setErrorMsg("Failed to load organization data. Verify Firestore database connection.");
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
        name: deptForm.name.trim(),
        code: deptForm.code.trim().toUpperCase(),
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

  const handleOpenEditDept = (dept) => {
    setEditDept(dept);
    setDeptForm({
      name: dept.name || "",
      code: dept.code || "",
      headUserId: dept.headUserId || "",
      parentDepartmentId: dept.parentDepartmentId || "",
      status: dept.status || "Active",
    });
  };

  const handleSaveDept = async (e) => {
    e.preventDefault();
    if (!deptForm.name.trim() || !deptForm.code.trim()) return;

    setModalLoading(true);
    try {
      const headUser = employees.find((emp) => emp.id === deptForm.headUserId);
      await updateDepartment(editDept.id, {
        name: deptForm.name.trim(),
        code: deptForm.code.trim().toUpperCase(),
        headUserId: deptForm.headUserId || null,
        headName: headUser ? headUser.name : null,
        parentDepartmentId: deptForm.parentDepartmentId || null,
        status: deptForm.status,
      });

      setEditDept(null);
      setDeptForm({ name: "", code: "", headUserId: "", parentDepartmentId: "", status: "Active" });
      await loadData();
    } catch (err) {
      alert("Failed to update department: " + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleAssignEmployee = async () => {
    if (!assignEmpId || !viewDept) return;
    setModalLoading(true);
    try {
      const emp = employees.find(e => e.id === assignEmpId);
      if (emp) {
        await updateUserProfile(assignEmpId, {
          departmentId: viewDept.id,
          departmentName: viewDept.name,
        });
        setAssignEmpId("");
        await loadData();
      }
    } catch (err) {
      alert("Failed to assign employee: " + err.message);
    } finally {
      setModalLoading(false);
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
        name: catForm.name.trim(),
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

  // ─── Promote or Demote Employee Role ──────────────────────────
  const handleRoleChange = (employee, newRole) => {
    setPendingRoleChange({ employee, newRole });
    setShowConfirmModal(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!pendingRoleChange) return;
    const { employee, newRole } = pendingRoleChange;
    setErrorMsg(null);
    setShowConfirmModal(false);
    try {
      await promoteUser(currentUser?.uid || "", employee.id, newRole);
      setEmployees((prev) =>
        prev.map((emp) => (emp.id === employee.id ? { ...emp, role: newRole } : emp))
      );
      setPendingRoleChange(null);
    } catch (err) {
      console.error("Failed to change employee role:", err);
      setErrorMsg("Failed to change employee role. You might not have Admin permissions.");
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

        {activeTab === "departments" && currentRole === "Admin" && (
          <button id="add-dept-btn" className="org-add-btn" onClick={() => setShowDeptModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Department
          </button>
        )}

        {activeTab === "categories" && currentRole === "Admin" && (
          <button id="add-cat-btn" className="org-add-btn" onClick={() => setShowCatModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Category
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
                  {currentRole === "Admin" && <th>Actions</th>}
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
                    const headUser = employees.find(e => e.id === dept.headUserId);
                    const displayName = headUser ? (headUser.name || headUser.email) : (dept.headName || "—");
                    const actualEmployeeCount = employees.filter(e => e.departmentId === dept.id).length;

                    return (
                      <tr key={dept.id}>
                        <td style={{ fontFamily: "monospace", color: "#a78bfa" }}>{dept.code}</td>
                        <td className="org-cell-name">{dept.name}</td>
                        <td>{displayName}</td>
                        <td className="org-cell-muted">{parent ? parent.name : "—"}</td>
                        <td><span className="count-badge">{actualEmployeeCount}</span></td>
                        <td>
                          {currentRole === "Admin" ? (
                            <button
                              className={`status-pill ${dept.status === "Active" ? "status-active" : "status-inactive"}`}
                              onClick={() => handleToggleDeptStatus(dept)}
                            >
                              {dept.status}
                            </button>
                          ) : (
                            <span className={`status-pill ${dept.status === "Active" ? "status-active" : "status-inactive"}`} style={{ cursor: "default" }}>
                              {dept.status}
                            </span>
                          )}
                        </td>
                        {currentRole === "Admin" && (
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="detail-panel-edit-btn" onClick={() => setViewDept(dept)} title="View Details">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <button className="detail-panel-edit-btn" onClick={() => handleOpenEditDept(dept)} title="Edit">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        )}
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
                        {currentRole === "Admin" ? (
                          <select
                            value={emp.role || "Employee"}
                            onChange={(e) => handleRoleChange(emp, e.target.value)}
                            style={{
                              background: "rgba(10, 10, 24, 0.8)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              color: "var(--text-primary)",
                              padding: "4px 8px",
                              fontSize: "13px",
                              outline: "none",
                              cursor: "pointer",
                              fontFamily: "inherit"
                            }}
                          >
                            <option value="Employee">Employee</option>
                            <option value="DepartmentHead">Department Head</option>
                            <option value="AssetManager">Asset Manager</option>
                            <option value="Admin">Admin</option>
                          </select>
                        ) : (
                          <span className={`role-badge ${emp.role === "Admin" ? "status-active" : ""}`}>
                            {emp.role || "Employee"}
                          </span>
                        )}
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

      {/* Edit Department Modal */}
      {editDept && (
        <div className="modal-overlay" onClick={() => setEditDept(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveDept}>
            <div className="modal-header">
              <h2>Edit Department</h2>
              <button type="button" className="modal-close" onClick={() => setEditDept(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Department Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Engineering"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Department Code *</label>
                <input
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
                <label className="form-label">Parent Department</label>
                <select
                  className="form-input form-select"
                  value={deptForm.parentDepartmentId}
                  onChange={(e) => setDeptForm({ ...deptForm, parentDepartmentId: e.target.value })}
                >
                  <option value="">Top Level (No Parent)</option>
                  {departments.filter(d => d.status === "Active" && d.id !== editDept.id).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <div className="modal-status-toggle">
                  <button
                    type="button"
                    className={`status-toggle-btn ${deptForm.status === "Active" ? "active" : ""}`}
                    onClick={() => setDeptForm({ ...deptForm, status: "Active" })}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`status-toggle-btn ${deptForm.status === "Inactive" ? "active" : ""}`}
                    onClick={() => setDeptForm({ ...deptForm, status: "Inactive" })}
                  >
                    Inactive
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-outline modal-cancel" onClick={() => setEditDept(null)}>Cancel</button>
              <button type="submit" className="btn-primary modal-confirm" disabled={modalLoading}>
                {modalLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View Department Details Modal */}
      {viewDept && (
        <div className="modal-overlay" onClick={() => setViewDept(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', width: '100%' }}>
            <div className="modal-header">
              <h2>Department Details: {viewDept.name}</h2>
              <button type="button" className="modal-close" onClick={() => setViewDept(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                 <div><span style={{ color: 'var(--text-muted)' }}>Code:</span> <strong style={{ color: 'var(--text-primary)' }}>{viewDept.code}</strong></div>
                 <div><span style={{ color: 'var(--text-muted)' }}>Head:</span> <strong style={{ color: 'var(--text-primary)' }}>{viewDept.headName || "—"}</strong></div>
                 <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> <strong style={{ color: 'var(--text-primary)' }}>{viewDept.status}</strong></div>
                 <div><span style={{ color: 'var(--text-muted)' }}>Parent:</span> <strong style={{ color: 'var(--text-primary)' }}>
                   {departments.find(d => d.id === viewDept.parentDepartmentId)?.name || "—"}
                 </strong></div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Employees ({employees.filter(emp => emp.departmentId === viewDept.id).length})</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="form-input form-select" 
                    style={{ padding: '6px 12px', minWidth: '200px' }}
                    value={assignEmpId}
                    onChange={(e) => setAssignEmpId(e.target.value)}
                  >
                    <option value="">Select Employee to Assign</option>
                    {employees.filter(emp => emp.departmentId !== viewDept.id).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name || emp.email} ({emp.departmentName || "Unassigned"})</option>
                    ))}
                  </select>
                  <button 
                    className="btn-primary" 
                    style={{ padding: '6px 16px' }}
                    onClick={handleAssignEmployee}
                    disabled={!assignEmpId || modalLoading}
                  >
                    Assign
                  </button>
                </div>
              </div>
              
              <div className="org-table-wrap" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="org-table">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.filter(emp => emp.departmentId === viewDept.id).length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>No employees in this department.</td></tr>
                    ) : (
                      employees.filter(emp => emp.departmentId === viewDept.id).map(emp => (
                        <tr key={emp.id}>
                          <td className="org-cell-name">{emp.name || "—"}</td>
                          <td>{emp.email}</td>
                          <td><span className="role-badge">{emp.role}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Role Change Modal */}
      {showConfirmModal && pendingRoleChange && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setPendingRoleChange(null); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Role Change</h2>
              <button type="button" className="modal-close" onClick={() => { setShowConfirmModal(false); setPendingRoleChange(null); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.6" }}>
              <p>
                Are you sure you want to change the role of{" "}
                <strong>{pendingRoleChange.employee.name || pendingRoleChange.employee.email}</strong> from{" "}
                <span className="role-badge" style={{ verticalAlign: "middle" }}>{pendingRoleChange.employee.role || "Employee"}</span> to{" "}
                <span className="role-badge" style={{ verticalAlign: "middle", background: "rgba(139, 92, 246, 0.2)", borderColor: "rgba(139, 92, 246, 0.4)" }}>{pendingRoleChange.newRole}</span>?
              </p>
              <p style={{ marginTop: "12px", color: "var(--text-muted)", fontSize: "13px" }}>
                This will immediately update their access permissions across the system.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-outline modal-cancel" onClick={() => { setShowConfirmModal(false); setPendingRoleChange(null); }}>Cancel</button>
              <button id="confirm-change-role-btn" className="btn-primary modal-confirm" onClick={handleConfirmRoleChange}>Confirm Change</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
