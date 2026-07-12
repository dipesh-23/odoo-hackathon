import { useState } from "react";
import SpotlightCard from "../components/SpotlightCard";

// Sample data for departments
const initialDepartments = [
  { id: 1, name: "Engineering", head: "Aditi Rao", parentDept: "—", status: "Active" },
  { id: 2, name: "Facilities", head: "Rohan Mehta", parentDept: "—", status: "Active" },
  { id: 3, name: "Field Ops (East)", head: "Sana Iqbal", parentDept: "Field Ops", status: "Inactive" },
];

const initialCategories = [
  { id: 1, name: "IT Equipment", description: "Laptops, monitors, peripherals", count: 142 },
  { id: 2, name: "Furniture", description: "Desks, chairs, storage units", count: 89 },
  { id: 3, name: "Vehicles", description: "Company cars, delivery vans", count: 24 },
];

const initialEmployees = [
  { id: 1, name: "Aditi Rao", email: "aditi.rao@company.com", department: "Engineering", role: "Department Head" },
  { id: 2, name: "Rohan Mehta", email: "rohan.mehta@company.com", department: "Facilities", role: "Department Head" },
  { id: 3, name: "Sana Iqbal", email: "sana.iqbal@company.com", department: "Field Ops (East)", role: "Manager" },
];

const tabs = [
  { id: "departments", label: "Departments" },
  { id: "categories", label: "Categories" },
  { id: "employees", label: "Employees" },
];

export default function OrganizationSetup() {
  const [activeTab, setActiveTab] = useState("departments");
  const [departments, setDepartments] = useState(initialDepartments);
  const [categories] = useState(initialCategories);
  const [employees] = useState(initialEmployees);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Department form state
  const [newDept, setNewDept] = useState({ name: "", head: "", parentDept: "", status: "Active" });

  const handleAddDepartment = () => {
    if (!newDept.name.trim()) return;
    setDepartments((prev) => [
      ...prev,
      { ...newDept, id: Date.now(), parentDept: newDept.parentDept || "—" },
    ]);
    setNewDept({ name: "", head: "", parentDept: "", status: "Active" });
    setShowAddModal(false);
  };

  const toggleStatus = (id) => {
    setDepartments((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: d.status === "Active" ? "Inactive" : "Active" } : d
      )
    );
  };

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
        {activeTab === "departments" && (
          <button
            id="add-dept-btn"
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

      {/* Content Area */}
      <SpotlightCard className="org-content-card">
        {/* Departments Table */}
        {activeTab === "departments" && (
          <div className="org-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Head</th>
                  <th>Parent Dept</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id}>
                    <td className="org-cell-name">{dept.name}</td>
                    <td>{dept.head}</td>
                    <td className="org-cell-muted">{dept.parentDept}</td>
                    <td>
                      <button
                        className={`status-pill ${dept.status === "Active" ? "status-active" : "status-inactive"}`}
                        onClick={() => toggleStatus(dept.id)}
                      >
                        {dept.status}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        {/* Categories Table */}
        {activeTab === "categories" && (
          <div className="org-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Asset Count</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id}>
                    <td className="org-cell-name">{cat.name}</td>
                    <td>{cat.description}</td>
                    <td>
                      <span className="count-badge">{cat.count}</span>
                    </td>
                  </tr>
                ))}
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
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="org-cell-name">{emp.name}</td>
                    <td>{emp.email}</td>
                    <td>{emp.department}</td>
                    <td>
                      <span className="role-badge">{emp.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SpotlightCard>

      {/* Add Department Modal */}
      {showAddModal && (
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
                <label className="form-label">Head</label>
                <input
                  id="dept-head-input"
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={newDept.head}
                  onChange={(e) => setNewDept({ ...newDept, head: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Parent Department</label>
                <input
                  id="dept-parent-input"
                  className="form-input"
                  placeholder="Leave empty for top-level"
                  value={newDept.parentDept}
                  onChange={(e) => setNewDept({ ...newDept, parentDept: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <div className="modal-status-toggle">
                  <button
                    type="button"
                    className={`status-toggle-btn ${newDept.status === "Active" ? "active" : ""}`}
                    onClick={() => setNewDept({ ...newDept, status: "Active" })}
                  >Active</button>
                  <button
                    type="button"
                    className={`status-toggle-btn ${newDept.status === "Inactive" ? "active" : ""}`}
                    onClick={() => setNewDept({ ...newDept, status: "Inactive" })}
                  >Inactive</button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline modal-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button id="confirm-add-dept" className="btn-primary modal-confirm" onClick={handleAddDepartment}>Add Department</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
